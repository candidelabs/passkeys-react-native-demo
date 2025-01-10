import { useMemo, useState } from "react";
import { SafeAccountV0_2_0 as SafeAccount } from "abstractionkit";
import * as SecureStore from "expo-secure-store";

import { WebauthPublicKey } from "../logic/passkeys";
import { View, Text, Button } from "react-native";
import { ACCOUNT_ADDRESS_STORAGE_KEY } from "../hooks/useSecurePasskey";
import { useSecureStore } from "../hooks/useSecurePasskey";

function PasskeyCard({
  passkey,
  handleCreatePasskeyClick,
  handleLogout,
}: {
  passkey?: string;
  handleCreatePasskeyClick: () => void;
  handleLogout: () => void;
}) {
  const { saveData: saveAccountAddress } = useSecureStore(
    ACCOUNT_ADDRESS_STORAGE_KEY
  );
  const getAccountAddress = useMemo(() => {
    if (!passkey) return undefined;

    const parsedPasskey = JSON.parse(passkey);
    const webauthPublicKey: WebauthPublicKey = {
      x: BigInt(parsedPasskey.pubkeyCoordinates.x.replace("n", "")),
      y: BigInt(parsedPasskey.pubkeyCoordinates.y.replace("n", "")),
    };

    const accountAddress = SafeAccount.createAccountAddress([webauthPublicKey]);
    saveAccountAddress(accountAddress);
    return accountAddress;
  }, [passkey]);

  return passkey ? (
    <View>
      <Text>
        Account Address:
        {getAccountAddress}
      </Text>
      <Button title="Logout" onPress={handleLogout} />
    </View>
  ) : (
    <View>
      <Text>
        First, you need to create a passkey which will be used to sign
        transactions
      </Text>
      <Button title="Create Account" onPress={handleCreatePasskeyClick} />
    </View>
  );
}

export { PasskeyCard };
