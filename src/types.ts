export type Category = 'Food' | 'Travel' | 'Shopping' | 'Bills' | 'Entertainment' | 'Health' | 'Other';

export interface Expense {
  id: string;
  amount: number;
  category: Category;
  date: string;
  note: string;
}

export interface BudgetData {
  salary: number;
  monthlyBudget: number;
  expenses: Expense[];
}
