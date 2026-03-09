"use client";

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";

interface Customer {
  id: string;
  customer_id: string;
  first_name: string;
  last_name: string;
  email?: string;
}

interface CustomerContextValue {
  customerId: string | null;
  customerName: string;
  customers: Customer[];
  loading: boolean;
  isAuthCustomer: boolean;
  setCustomerId: (id: string) => void;
}

const CustomerCtx = createContext<CustomerContextValue>({
  customerId: null,
  customerName: "",
  customers: [],
  loading: true,
  isAuthCustomer: false,
  setCustomerId: () => {},
});

export function useCustomer() {
  return useContext(CustomerCtx);
}

const STORAGE_KEY = "portal_customer_id";

interface CustomerProviderProps {
  children: ReactNode;
  authCustomerId?: string | null;
}

export function CustomerProvider({ children, authCustomerId }: CustomerProviderProps) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerIdState] = useState<string | null>(authCustomerId || null);
  const [loading, setLoading] = useState(true);
  const isAuthCustomer = Boolean(authCustomerId);

  useEffect(() => {
    if (isAuthCustomer) {
      // Auth-bound customer: fetch only their own record
      (async () => {
        try {
          const res = await fetch(`/api/customers/${authCustomerId}`);
          const data = await res.json();
          if (data.customer) {
            setCustomers([data.customer]);
            setCustomerIdState(data.customer.id);
          }
        } catch {
          // ignore
        } finally {
          setLoading(false);
        }
      })();
      return;
    }

    // Admin/dev mode: fetch all customers, dropdown selection
    (async () => {
      try {
        const res = await fetch("/api/customers?limit=50");
        const data = await res.json();
        const list: Customer[] = data.customers || [];
        setCustomers(list);

        // Restore from localStorage or default to first customer
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored && list.some((c) => c.id === stored)) {
          setCustomerIdState(stored);
        } else if (list.length > 0) {
          setCustomerIdState(list[0].id);
          localStorage.setItem(STORAGE_KEY, list[0].id);
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, [isAuthCustomer, authCustomerId]);

  const setCustomerId = useCallback(
    (id: string) => {
      if (isAuthCustomer) return; // Cannot switch identity when auth-bound
      setCustomerIdState(id);
      localStorage.setItem(STORAGE_KEY, id);
    },
    [isAuthCustomer]
  );

  const selected = customers.find((c) => c.id === customerId);
  const customerName = selected ? `${selected.first_name} ${selected.last_name}` : "";

  return (
    <CustomerCtx.Provider value={{ customerId, customerName, customers, loading, isAuthCustomer, setCustomerId }}>
      {children}
    </CustomerCtx.Provider>
  );
}

export function CustomerSelector() {
  const { customerId, customerName, customers, loading, isAuthCustomer, setCustomerId } = useCustomer();

  // Auth-bound customer: show name instead of dropdown
  if (isAuthCustomer) {
    return (
      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 px-2 py-1">
        {customerName}
      </p>
    );
  }

  if (loading) return <p className="text-xs text-gray-400 px-2">Loading...</p>;
  if (customers.length === 0) return <p className="text-xs text-gray-400 px-2">No customers</p>;

  return (
    <select
      value={customerId || ""}
      onChange={(e) => setCustomerId(e.target.value)}
      className="w-full text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      {customers.map((c) => (
        <option key={c.id} value={c.id}>
          {c.first_name} {c.last_name} ({c.customer_id})
        </option>
      ))}
    </select>
  );
}
