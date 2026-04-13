import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, 
  Wallet, 
  TrendingDown, 
  TrendingUp, 
  Calendar as CalendarIcon, 
  Trash2, 
  PieChart as PieChartIcon,
  Settings,
  ChevronRight,
  IndianRupee,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  CreditCard,
  DollarSign,
  Edit3,
  LogIn,
  LogOut,
  User
} from 'lucide-react';
import { format, parseISO, startOfMonth, endOfMonth, isWithinInterval, subMonths } from 'date-fns';
import { 
  PieChart, 
  Pie, 
  Cell, 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip, 
  Legend,
  CartesianGrid
} from 'recharts';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Separator } from '@/components/ui/separator';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Category, Expense, BudgetData } from './types';

// PDF Export Imports
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// Firebase Imports
import { auth, db, handleFirestoreError, OperationType } from './lib/firebase';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  User as FirebaseUser
} from 'firebase/auth';
import { 
  doc, 
  setDoc, 
  getDoc, 
  onSnapshot, 
  collection, 
  query, 
  where, 
  orderBy, 
  addDoc, 
  deleteDoc,
  updateDoc,
  serverTimestamp
} from 'firebase/firestore';

const CATEGORIES: Category[] = ['Food', 'Travel', 'Shopping', 'Bills', 'Entertainment', 'Health', 'Other'];

const CATEGORY_COLORS: Record<Category, string> = {
  Food: '#00ff9d',
  Travel: '#3b82f6',
  Shopping: '#f59e0b',
  Bills: '#ef4444',
  Entertainment: '#a855f7',
  Health: '#ec4899',
  Other: '#64748b',
};

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [data, setData] = useState<BudgetData>({
    salary: 0,
    monthlyBudget: 0,
    expenses: [],
  });

  const [activeTab, setActiveTab] = useState<'dashboard' | 'expenses' | 'settings'>('dashboard');
  const [isSalaryEditing, setIsSalaryEditing] = useState(false);
  const [tempSalary, setTempSalary] = useState('0');

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  // Firestore Sync
  useEffect(() => {
    if (!user) {
      setData({ salary: 0, monthlyBudget: 0, expenses: [] });
      return;
    }

    // 1. Sync User Profile (Salary/Budget)
    const userDocRef = doc(db, 'users', user.uid);
    const unsubUser = onSnapshot(userDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const userData = docSnap.data();
        setData(prev => ({
          ...prev,
          salary: userData.salary || 0,
          monthlyBudget: userData.monthlyBudget || 0
        }));
        setTempSalary((userData.salary || 0).toString());
      } else {
        // Initialize user doc if it doesn't exist
        setDoc(userDocRef, { salary: 0, monthlyBudget: 0, updatedAt: new Date().toISOString() })
          .catch(err => handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}`));
      }
    }, (err) => handleFirestoreError(err, OperationType.GET, `users/${user.uid}`));

    // 2. Sync Expenses
    const expensesRef = collection(db, 'expenses');
    const q = query(
      expensesRef, 
      where('uid', '==', user.uid),
      orderBy('date', 'desc')
    );
    
    const unsubExpenses = onSnapshot(q, (snapshot) => {
      const expensesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Expense[];
      setData(prev => ({ ...prev, expenses: expensesData }));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'expenses'));

    return () => {
      unsubUser();
      unsubExpenses();
    };
  }, [user]);

  const login = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
      toast.success('Access Granted', { description: 'Authenticated with Terminal' });
    } catch (error) {
      toast.error('Auth Failed', { description: 'Could not establish secure connection' });
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
      toast.info('Session Terminated');
    } catch (error) {
      toast.error('Logout Failed');
    }
  };

  const totalExpenses = useMemo(() => 
    data.expenses.reduce((acc, curr) => acc + curr.amount, 0), 
  [data.expenses]);

  const monthlyExpenses = useMemo(() => {
    const now = new Date();
    const start = startOfMonth(now);
    const end = endOfMonth(now);
    return data.expenses
      .filter(e => isWithinInterval(parseISO(e.date), { start, end }))
      .reduce((acc, curr) => acc + curr.amount, 0);
  }, [data.expenses]);

  const remainingBudget = data.monthlyBudget - monthlyExpenses;
  const budgetProgress = data.monthlyBudget > 0 ? (monthlyExpenses / data.monthlyBudget) * 100 : 0;

  const chartData = useMemo(() => {
    const grouped = data.expenses.reduce((acc, curr) => {
      acc[curr.category] = (acc[curr.category] || 0) + curr.amount;
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(grouped).map(([name, value]) => ({
      name,
      value,
      color: CATEGORY_COLORS[name as Category],
    }));
  }, [data.expenses]);

  const trendData = useMemo(() => {
    const last6Months = Array.from({ length: 6 }).map((_, i) => {
      const date = subMonths(new Date(), 5 - i);
      const start = startOfMonth(date);
      const end = endOfMonth(date);
      const spent = data.expenses
        .filter(e => isWithinInterval(parseISO(e.date), { start, end }))
        .reduce((acc, curr) => acc + curr.amount, 0);
      return {
        name: format(date, 'MMM'),
        spent,
        budget: data.monthlyBudget,
      };
    });
    return last6Months;
  }, [data.expenses, data.monthlyBudget]);

  const addExpense = async (expense: Omit<Expense, 'id'>) => {
    if (!user) return;
    try {
      await addDoc(collection(db, 'expenses'), {
        ...expense,
        uid: user.uid,
        createdAt: serverTimestamp()
      });
      toast.success('Transaction Executed', {
        description: `Logged ₹${expense.amount} for ${expense.category}`,
        style: { background: '#14171c', color: '#fff', border: '1px solid #262b33' }
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'expenses');
    }
  };

  const deleteExpense = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'expenses', id));
      toast.info('Transaction Reversed');
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `expenses/${id}`);
    }
  };

  const updateSalary = async () => {
    if (!user) return;
    const val = Number(tempSalary);
    if (isNaN(val)) return;
    
    try {
      await updateDoc(doc(db, 'users', user.uid), { 
        salary: val,
        updatedAt: new Date().toISOString()
      });
      setIsSalaryEditing(false);
      toast.success('Portfolio Updated', {
        description: `New salary set to ₹${val.toLocaleString()}`,
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`);
    }
  };

  const updateSettings = async (salary: number, monthlyBudget: number) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'users', user.uid), { 
        salary, 
        monthlyBudget,
        updatedAt: new Date().toISOString()
      });
      toast.success('Strategy Updated');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`);
    }
  };

  const exportToCSV = () => {
    if (data.expenses.length === 0) {
      toast.error('No data to export', { description: 'Your ledger is currently empty.' });
      return;
    }

    const headers = ['Date', 'Category', 'Amount', 'Note'];
    const rows = data.expenses.map(e => [
      format(parseISO(e.date), 'yyyy-MM-dd HH:mm'),
      e.category,
      e.amount,
      e.note || ''
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell.toString().replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `spendwise_ledger_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast.success('Export Complete', { 
      description: 'CSV ledger has been downloaded.',
      style: { background: '#14171c', color: '#fff', border: '1px solid #262b33' }
    });
  };

  const exportToPDF = () => {
    if (!user) return;
    
    const now = new Date();
    const start = startOfMonth(now);
    const end = endOfMonth(now);
    const monthlyExpensesData = data.expenses.filter(e => 
      isWithinInterval(parseISO(e.date), { start, end })
    );

    if (monthlyExpensesData.length === 0) {
      toast.error('No data for this month', { description: 'Your ledger for the current month is empty.' });
      return;
    }

    const doc = new jsPDF();
    
    // Header - Logo Representation
    // Draw a blue rounded rectangle for the logo
    doc.setFillColor(59, 130, 246); // finance-accent color
    doc.roundedRect(15, 15, 20, 20, 4, 4, 'F');
    
    // Draw a white pulse line (simplified)
    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(1);
    doc.line(18, 25, 22, 25);
    doc.line(22, 25, 24, 20);
    doc.line(24, 20, 26, 30);
    doc.line(26, 30, 28, 25);
    doc.line(28, 25, 32, 25);

    // App Name
    doc.setTextColor(20, 23, 28);
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.text('SPENDWISE', 40, 25);
    doc.setTextColor(59, 130, 246);
    doc.text('PRO', 95, 25);

    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.setFont('helvetica', 'normal');
    doc.text('LIVE MARKET | REAL-TIME TRACKING', 40, 32);

    // User Info Section
    doc.setDrawColor(226, 232, 240);
    doc.line(15, 45, 195, 45);

    doc.setTextColor(20, 23, 28);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('FINANCIAL STATEMENT', 15, 55);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`User Name: ${user.displayName || 'Anonymous User'}`, 15, 65);
    doc.text(`Monthly Salary: Rs. ${data.salary.toLocaleString()}`, 15, 72);
    doc.text(`Statement Period: ${format(start, 'MMMM yyyy')}`, 15, 79);

    const totalMonthly = monthlyExpensesData.reduce((acc, curr) => acc + curr.amount, 0);
    doc.text(`Total Monthly Expenses: Rs. ${totalMonthly.toLocaleString()}`, 15, 86);
    doc.text(`Remaining Liquidity: Rs. ${(data.salary - totalMonthly).toLocaleString()}`, 15, 93);

    // Expenses Table
    autoTable(doc, {
      startY: 105,
      head: [['Date', 'Category', 'Amount (Rs.)', 'Note']],
      body: monthlyExpensesData.map(e => [
        format(parseISO(e.date), 'dd MMM yyyy HH:mm'),
        e.category,
        e.amount.toLocaleString(),
        e.note || '-'
      ]),
      headStyles: { fillColor: [59, 130, 246], textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { top: 105 },
      theme: 'striped'
    });

    // Footer
    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text(
        `Generated by SpendWise Pro on ${format(new Date(), 'dd/MM/yyyy HH:mm')} - Page ${i} of ${pageCount}`,
        15,
        doc.internal.pageSize.height - 10
      );
    }

    doc.save(`spendwise_statement_${format(now, 'MMM_yyyy')}.pdf`);
    
    toast.success('Statement Generated', { 
      description: 'Monthly PDF statement has been downloaded.',
      style: { background: '#14171c', color: '#fff', border: '1px solid #262b33' }
    });
  };

  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-finance-bg flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Activity className="text-finance-accent animate-pulse" size={48} />
          <p className="text-xs font-mono text-slate-500 uppercase tracking-widest">Initializing Terminal...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-finance-bg flex items-center justify-center p-4">
        <Card className="glass-card max-w-md w-full p-8 text-center space-y-8">
          <div className="flex justify-center">
            <div className="w-20 h-20 bg-finance-accent rounded-3xl flex items-center justify-center shadow-[0_0_40px_rgba(59,130,246,0.3)]">
              <Activity className="text-white" size={40} />
            </div>
          </div>
          <div className="space-y-2">
            <h1 className="text-3xl font-display font-bold text-white tracking-tight">SPENDWISE PRO</h1>
            <p className="text-slate-400 text-sm">Secure financial terminal for portfolio tracking.</p>
          </div>
          <Button 
            onClick={login} 
            className="w-full bg-finance-accent hover:bg-finance-accent/90 text-white font-mono h-12 text-sm uppercase tracking-widest"
          >
            <LogIn className="mr-2" size={18} /> Authenticate with Google
          </Button>
          <p className="text-[10px] text-slate-600 font-mono uppercase tracking-widest">End-to-end encrypted ledger</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-finance-bg p-4 md:p-8 lg:p-10 selection:bg-finance-accent/30">
      <div className="max-w-7xl mx-auto space-y-10">
        {/* Header Ticker Style */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-finance-accent rounded-xl flex items-center justify-center shadow-[0_0_20px_rgba(59,130,246,0.5)]">
              <Activity className="text-white" size={28} />
            </div>
            <div className="space-y-0.5">
              <h1 className="text-3xl md:text-4xl font-display tracking-tight">SPEND<span className="text-finance-accent">WISE</span> PRO</h1>
              <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-slate-500">
                <span className="flex items-center gap-1 text-finance-up"><ArrowUpRight size={12} /> LIVE MARKET</span>
                <Separator orientation="vertical" className="h-3 bg-slate-800" />
                <span>REAL-TIME TRACKING</span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <nav className="flex items-center gap-1 bg-finance-card/50 p-1.5 rounded-2xl border border-finance-border backdrop-blur-xl">
              <NavButton 
                active={activeTab === 'dashboard'} 
                onClick={() => setActiveTab('dashboard')}
                icon={<Activity size={18} />}
                label="Terminal"
              />
              <NavButton 
                active={activeTab === 'expenses'} 
                onClick={() => setActiveTab('expenses')}
                icon={<CreditCard size={18} />}
                label="Ledger"
              />
              <NavButton 
                active={activeTab === 'settings'} 
                onClick={() => setActiveTab('settings')}
                icon={<Settings size={18} />}
                label="Strategy"
              />
            </nav>
            
            <Popover>
              <PopoverTrigger asChild>
                <button className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center overflow-hidden hover:border-finance-accent transition-colors">
                  {user.photoURL ? (
                    <img src={user.photoURL} alt="Profile" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                  ) : (
                    <User size={20} className="text-slate-400" />
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-56 bg-finance-card border-finance-border p-2" align="end">
                <div className="p-3 mb-2">
                  <p className="text-xs font-bold text-white truncate">{user.displayName}</p>
                  <p className="text-[10px] text-slate-500 truncate">{user.email}</p>
                </div>
                <Separator className="bg-slate-800 mb-2" />
                <Button 
                  variant="ghost" 
                  onClick={logout}
                  className="w-full justify-start text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 h-9"
                >
                  <LogOut className="mr-2" size={14} /> Terminate Session
                </Button>
              </PopoverContent>
            </Popover>
          </div>
        </header>

        <AnimatePresence mode="wait">
          {activeTab === 'dashboard' && (
            <motion.div 
              key="dashboard"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              {/* Market Summary Grid */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="glass-card ticker-bg col-span-1 md:col-span-2">
                  <CardContent className="p-6 flex items-center justify-between">
                    <div className="space-y-1">
                      <p className="text-xs font-mono text-slate-500 uppercase tracking-widest">Total Liquidity (Salary)</p>
                      {isSalaryEditing ? (
                        <div className="flex items-center gap-2">
                          <Input 
                            value={tempSalary} 
                            onChange={e => setTempSalary(e.target.value)}
                            className="w-32 h-10 bg-finance-bg border-finance-border text-2xl font-mono text-finance-up"
                            autoFocus
                          />
                          <Button size="sm" onClick={updateSalary} className="bg-finance-up text-black hover:bg-finance-up/80">Save</Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3 group">
                          <h2 className="text-4xl font-mono text-finance-up tracking-tighter">
                            ₹{data.salary.toLocaleString()}
                          </h2>
                          <button 
                            onClick={() => setIsSalaryEditing(true)}
                            className="p-2 rounded-lg bg-slate-800/50 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Edit3 size={16} />
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="hidden sm:block">
                      <div className="flex items-center gap-1 text-finance-up text-sm font-mono">
                        <ArrowUpRight size={16} /> +12.5%
                      </div>
                      <p className="text-[10px] text-slate-600 text-right">VS LAST MONTH</p>
                    </div>
                  </CardContent>
                </Card>

                <StatCard 
                  title="Monthly Burn" 
                  value={monthlyExpenses} 
                  icon={<TrendingDown className="text-finance-down" />}
                  trend="-₹2,400"
                  isDown
                />
                
                <StatCard 
                  title="Net Position" 
                  value={data.salary - totalExpenses} 
                  icon={<Wallet className="text-finance-accent" />}
                  trend="+₹15,200"
                />
              </div>

              {/* Main Terminal Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Chart Section */}
                <div className="lg:col-span-2 space-y-6">
                  <Card className="glass-card">
                    <CardHeader className="flex flex-row items-center justify-between">
                      <div>
                        <CardTitle className="text-xl text-finance-accent">Spending Velocity</CardTitle>
                        <CardDescription className="text-slate-400">Monthly expense trend vs budget limit</CardDescription>
                      </div>
                      <div className="flex items-center gap-4 text-[10px] font-mono">
                        <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-finance-accent" /> SPENT</div>
                        <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-slate-500" /> BUDGET</div>
                      </div>
                    </CardHeader>
                    <CardContent className="h-[300px] pt-4">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={trendData}>
                          <defs>
                            <linearGradient id="colorSpent" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                          <XAxis 
                            dataKey="name" 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{ fill: '#94a3b8', fontSize: 10, fontFamily: 'JetBrains Mono' }} 
                          />
                          <YAxis hide />
                          <Tooltip 
                            contentStyle={{ background: '#14171c', border: '1px solid #262b33', borderRadius: '12px' }}
                            itemStyle={{ color: '#fff', fontSize: '12px' }}
                          />
                          <Area 
                            type="monotone" 
                            dataKey="spent" 
                            stroke="#3b82f6" 
                            strokeWidth={3}
                            fillOpacity={1} 
                            fill="url(#colorSpent)" 
                          />
                          <Area 
                            type="monotone" 
                            dataKey="budget" 
                            stroke="#475569" 
                            strokeWidth={1}
                            strokeDasharray="5 5"
                            fill="transparent" 
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Card className="glass-card">
                      <CardHeader>
                        <CardTitle className="text-lg text-finance-up">New Entry</CardTitle>
                        <CardDescription className="text-slate-400">Execute a new spending order</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <ExpenseForm onAdd={addExpense} />
                      </CardContent>
                    </Card>

                    <Card className="glass-card">
                      <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle className="text-lg text-amber-400">Order Book</CardTitle>
                        <Button variant="ghost" size="sm" className="text-finance-accent hover:text-finance-accent/80" onClick={() => setActiveTab('expenses')}>
                          FULL LOG
                        </Button>
                      </CardHeader>
                      <CardContent>
                        <ExpenseList 
                          expenses={data.expenses.slice(0, 5)} 
                          onDelete={deleteExpense} 
                          compact 
                        />
                      </CardContent>
                    </Card>
                  </div>
                </div>

                {/* Sidebar Analytics */}
                <div className="space-y-6">
                  <Card className="glass-card border-l-4 border-l-finance-accent">
                    <CardHeader>
                      <CardTitle className="text-lg text-purple-400">Asset Allocation</CardTitle>
                    </CardHeader>
                    <CardContent className="h-[250px]">
                      {chartData.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={chartData}
                              cx="50%"
                              cy="50%"
                              innerRadius={60}
                              outerRadius={85}
                              paddingAngle={8}
                              dataKey="value"
                            >
                              {chartData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                              ))}
                            </Pie>
                            <Tooltip 
                              contentStyle={{ background: '#14171c', border: '1px solid #262b33', borderRadius: '12px' }}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-2">
                          <PieChartIcon size={40} strokeWidth={1} />
                          <p className="text-xs font-mono">NO ASSETS LOGGED</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="glass-card bg-gradient-to-br from-finance-card to-slate-900 border-none">
                    <CardHeader>
                      <CardTitle className="text-lg text-rose-400">Risk Assessment</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <div className="space-y-3">
                        <div className="flex justify-between text-[10px] font-mono uppercase tracking-widest">
                          <span className="text-slate-400">Budget Utilization</span>
                          <span className={cn(
                            budgetProgress > 90 ? "text-finance-down" : "text-finance-up"
                          )}>{Math.round(budgetProgress)}%</span>
                        </div>
                        <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.min(budgetProgress, 100)}%` }}
                            className={cn(
                              "h-full transition-all duration-700",
                              budgetProgress > 90 ? "bg-finance-down shadow-[0_0_10px_rgba(239,68,68,0.5)]" : "bg-finance-up shadow-[0_0_10px_rgba(0,255,157,0.5)]"
                            )}
                          />
                        </div>
                      </div>
                      
                      <div className="p-4 rounded-xl bg-slate-800/30 border border-slate-700/50">
                        <p className="text-xs text-slate-300 leading-relaxed italic">
                          "{budgetProgress > 100 
                            ? "CRITICAL: Spending has exceeded liquidity limits. Immediate budget restructuring required."
                            : budgetProgress > 80
                            ? "WARNING: High volatility detected. Approaching monthly spending ceiling."
                            : "STABLE: Portfolio performing within expected parameters. Liquidity remains high."}"
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'expenses' && (
            <motion.div 
              key="expenses"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <Card className="glass-card">
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-finance-up">Transaction Ledger</CardTitle>
                    <CardDescription className="text-slate-400">Historical record of all executed spending orders.</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="border-finance-border hover:bg-slate-800 text-[10px] font-mono"
                      onClick={exportToCSV}
                    >
                      CSV
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="border-finance-border hover:bg-slate-800 text-[10px] font-mono text-rose-400 hover:text-rose-300"
                      onClick={exportToPDF}
                    >
                      PDF
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <ExpenseList 
                    expenses={data.expenses} 
                    onDelete={deleteExpense} 
                  />
                </CardContent>
              </Card>
            </motion.div>
          )}

          {activeTab === 'settings' && (
            <motion.div 
              key="settings"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="max-w-2xl mx-auto"
            >
              <Card className="glass-card">
                <CardHeader>
                  <CardTitle className="text-finance-accent">Strategic Parameters</CardTitle>
                  <CardDescription className="text-slate-400">Configure your global financial strategy and limits.</CardDescription>
                </CardHeader>
                <CardContent>
                  <BudgetSettings 
                    initialSalary={data.salary} 
                    initialBudget={data.monthlyBudget} 
                    onSave={updateSettings} 
                  />
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <Toaster theme="dark" position="bottom-right" />
    </div>
  );
}

function NavButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-mono uppercase tracking-widest transition-all duration-300",
        active 
          ? "bg-finance-accent text-white shadow-[0_0_15px_rgba(59,130,246,0.4)]" 
          : "text-slate-500 hover:text-slate-300 hover:bg-slate-800/50"
      )}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function StatCard({ title, value, icon, trend, isDown }: { title: string, value: number, icon: React.ReactNode, trend: string, isDown?: boolean }) {
  return (
    <Card className="glass-card group hover:border-finance-accent/50 transition-colors duration-500">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">{title}</CardTitle>
        <div className="p-2 bg-slate-800/50 rounded-lg">
          {icon}
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-mono font-bold text-white tracking-tighter">
          ₹{value.toLocaleString()}
        </div>
        <div className={cn(
          "flex items-center gap-1 text-[10px] font-mono mt-1",
          isDown ? "text-finance-down" : "text-finance-up"
        )}>
          {isDown ? <ArrowDownRight size={12} /> : <ArrowUpRight size={12} />}
          {trend}
        </div>
      </CardContent>
    </Card>
  );
}

function ExpenseForm({ onAdd }: { onAdd: (expense: Omit<Expense, 'id'>) => void }) {
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<Category>('Food');
  const [date, setDate] = useState<Date>(new Date());
  const [note, setNote] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || isNaN(Number(amount))) {
      toast.error('INVALID ORDER', { description: 'Please enter a valid numeric amount.' });
      return;
    }
    onAdd({
      amount: Number(amount),
      category,
      date: date.toISOString(),
      note,
    });
    setAmount('');
    setNote('');
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="amount" className="text-[10px] uppercase tracking-widest text-slate-400">Order Amount</Label>
        <div className="relative">
          <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
          <Input 
            id="amount"
            placeholder="0.00" 
            value={amount} 
            onChange={e => setAmount(e.target.value)}
            className="pl-9 bg-finance-bg border-finance-border text-white font-mono"
          />
        </div>
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-[10px] uppercase tracking-widest text-slate-400">Sector</Label>
          <Select value={category} onValueChange={(v) => setCategory(v as Category)}>
            <SelectTrigger className="bg-finance-bg border-finance-border text-white">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent className="bg-finance-card border-finance-border text-white">
              {CATEGORIES.map(c => (
                <SelectItem key={c} value={c} className="focus:bg-slate-800 focus:text-white">{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        <div className="space-y-1.5">
          <Label className="text-[10px] uppercase tracking-widest text-slate-400">Timestamp</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full justify-start text-left font-normal bg-finance-bg border-finance-border text-white hover:bg-slate-800">
                <CalendarIcon className="mr-2 h-3 w-3 text-slate-500" />
                <span className="text-xs">{format(date, 'dd/MM/yy')}</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 bg-finance-card border-finance-border" align="start">
              <Calendar
                mode="single"
                selected={date}
                onSelect={(d) => d && setDate(d)}
                initialFocus
                className="bg-finance-card text-white"
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>
      
      <div className="space-y-1.5">
        <Label htmlFor="note" className="text-[10px] uppercase tracking-widest text-slate-400">Order Memo</Label>
        <Input 
          id="note"
          placeholder="Transaction details..." 
          value={note} 
          onChange={e => setNote(e.target.value)}
          className="bg-finance-bg border-finance-border text-white text-xs"
        />
      </div>
      
      <Button type="submit" className="w-full bg-finance-accent hover:bg-finance-accent/90 text-white font-mono uppercase tracking-widest text-xs h-11">
        <Plus className="mr-2" size={16} /> Execute Order
      </Button>
    </form>
  );
}

function ExpenseList({ expenses, onDelete, compact }: { expenses: Expense[], onDelete: (id: string) => void, compact?: boolean }) {
  if (expenses.length === 0) {
    return (
      <div className="py-10 text-center text-slate-500 border-2 border-dashed border-slate-800 rounded-2xl">
        <p className="text-xs font-mono">NO TRANSACTIONS IN LEDGER</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {expenses.map((expense) => (
        <motion.div 
          layout
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          key={expense.id}
          className="flex items-center justify-between p-3 rounded-xl bg-slate-800/20 border border-slate-800/50 hover:border-slate-700 transition-all group"
        >
          <div className="flex items-center gap-3">
            <div 
              className="w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold text-white shadow-lg"
              style={{ backgroundColor: CATEGORY_COLORS[expense.category] }}
            >
              {expense.category.substring(0, 2).toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-medium text-white">{expense.note || expense.category}</p>
              <p className="text-[10px] font-mono text-slate-500">{format(parseISO(expense.date), 'HH:mm • dd MMM')}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <p className="text-sm font-mono font-bold text-finance-down">-₹{expense.amount.toLocaleString()}</p>
            {!compact && (
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8 text-slate-600 hover:text-finance-down hover:bg-finance-down/10 transition-colors"
                onClick={() => onDelete(expense.id)}
              >
                <Trash2 size={14} />
              </Button>
            )}
          </div>
        </motion.div>
      ))}
    </div>
  );
}

function BudgetSettings({ initialSalary, initialBudget, onSave }: { initialSalary: number, initialBudget: number, onSave: (s: number, b: number) => void }) {
  const [salary, setSalary] = useState(initialSalary.toString());
  const [budget, setBudget] = useState(initialBudget.toString());

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(Number(salary), Number(budget));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <div className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="salary" className="text-xs font-mono uppercase tracking-widest text-slate-500">Global Liquidity (Salary)</Label>
          <div className="relative">
            <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
            <Input 
              id="salary"
              type="number"
              value={salary} 
              onChange={e => setSalary(e.target.value)}
              className="pl-9 bg-finance-bg border-finance-border text-white font-mono text-lg h-12"
            />
          </div>
        </div>
        
        <Separator className="bg-slate-800" />
        
        <div className="space-y-2">
          <Label htmlFor="budget" className="text-xs font-mono uppercase tracking-widest text-slate-500">Monthly Risk Limit (Budget)</Label>
          <div className="relative">
            <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
            <Input 
              id="budget"
              type="number"
              value={budget} 
              onChange={e => setBudget(e.target.value)}
              className="pl-9 bg-finance-bg border-finance-border text-white font-mono text-lg h-12"
            />
          </div>
        </div>
      </div>
      
      <Button type="submit" className="w-full bg-finance-accent hover:bg-finance-accent/90 text-white font-mono uppercase tracking-widest h-12">
        COMMIT CHANGES
      </Button>
    </form>
  );
}
