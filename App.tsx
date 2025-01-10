import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { PasskeyCard } from "./components/PasskeyCard";
import { createPasskey, toBackendFormat } from "./logic/passkeys";
import { useState } from "react";
import {
  ACCOUNT_ADDRESS_STORAGE_KEY,
  PASSKEY_STORAGE_KEY,
  useSecureStore,
} from "./hooks/useSecurePasskey";
import { SafeCard } from "./components/SafeCard";

export default function App() {
  const {
    data: passkey,
    isLoading,
    saveData: savePasskey,
    removeData: removePasskey,
  } = useSecureStore(PASSKEY_STORAGE_KEY);
  const { removeData: removeAccountAddress } = useSecureStore(
    ACCOUNT_ADDRESS_STORAGE_KEY
  );
  const [error, setError] = useState<string | undefined>();

  const handleCreatePasskeyClick = async () => {
    setError(undefined);
    try {
      console.log("creating passkey");
      const result = await createPasskey();
      if (result) {
        await savePasskey(toBackendFormat(result));
      }
    } catch (error) {
      console.log(error);
      if (error instanceof Error) {
        setError(error.message);
      } else {
        setError("Unknown error");
      }
    }
  };

  const handleLogout = async () => {
    await removePasskey();
    await removeAccountAddress();
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text>Safe Passkeys Demo</Text>
      <PasskeyCard
        passkey={passkey}
        handleCreatePasskeyClick={handleCreatePasskeyClick}
        handleLogout={handleLogout}
      />
      {passkey && <SafeCard passkey={passkey} />}
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
});
