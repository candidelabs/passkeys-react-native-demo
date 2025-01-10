import { useState, useEffect } from "react";
import * as SecureStore from "expo-secure-store";

export const PASSKEY_STORAGE_KEY = "user_passkey";
export const ACCOUNT_ADDRESS_STORAGE_KEY = "account_address";

export function useSecureStore(key: string) {
  const [data, setData] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();

  // Load data from secure storage
  const loadData = async () => {
    try {
      setIsLoading(true);
      const storedData = await SecureStore.getItemAsync(key);
      if (storedData) {
        setData(storedData);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setIsLoading(false);
    }
  };

  const saveData = async (newData: string) => {
    try {
      await SecureStore.setItemAsync(key, newData);
      setData(newData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save data");
      throw err;
    }
  };

  const removeData = async () => {
    try {
      await SecureStore.deleteItemAsync(key);
      setData(undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove data");
      throw err;
    }
  };

  // Load data from secure storage on mount
  useEffect(() => {
    loadData();
  }, []);

  return {
    data,
    isLoading,
    error,
    saveData,
    removeData,
    loadData,
  };
}
