import { useEffect, useState } from "react";
import {
  SafeAccountV0_2_0 as SafeAccount,
  getFunctionSelector,
  createCallData,
  MetaTransaction,
  WebauthnDummySignerSignaturePair,
  CandidePaymaster,
} from "abstractionkit";
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  Linking,
  StyleSheet,
} from "react-native";
import {
  PasskeyLocalStorageFormat,
  signAndSendUserOp,
} from "../logic/passkeys";
import { JsonRpcProvider } from "ethers";
import {
  ACCOUNT_ADDRESS_STORAGE_KEY,
  useSecureStore,
} from "../hooks/useSecurePasskey";
import { envs } from "../envs";

const { bundlerUrl, paymasterUrl, chainName, jsonRPCProvider } = envs;

function SafeCard({ passkey }: { passkey: string }) {
  const parsedPasskey = JSON.parse(passkey) as PasskeyLocalStorageFormat;
  const { data: accountAddress } = useSecureStore(ACCOUNT_ADDRESS_STORAGE_KEY);
  const [userOpHash, setUserOpHash] = useState<string>();
  const [loadingTx, setLoadingTx] = useState<boolean>(false);
  const [error, setError] = useState<string>();
  const [txHash, setTxHash] = useState<string>();
  const [gasSponsor, setGasSponsor] = useState<
    | {
        name: string;
        description: string;
        url: string;
        icons: string[];
      }
    | undefined
  >(undefined);

  const handleMintNFT = async () => {
    if (!accountAddress) return;
    setLoadingTx(true);
    setTxHash("");
    setError("");
    // mint an NFT
    const nftContractAddress = "0x9a7af758aE5d7B6aAE84fe4C5Ba67c041dFE5336";
    const mintFunctionSignature = "mint(address)";
    const mintFunctionSelector = getFunctionSelector(mintFunctionSignature);
    const mintTransactionCallData = createCallData(
      mintFunctionSelector,
      ["address"],
      [accountAddress]
    );
    const mintTransaction: MetaTransaction = {
      to: nftContractAddress,
      value: 0n,
      data: mintTransactionCallData,
    };

    const safeAccount = SafeAccount.initializeNewAccount([
      parsedPasskey.pubkeyCoordinates,
    ]);

    try {
      let userOperation = await safeAccount.createUserOperation(
        [mintTransaction],
        jsonRPCProvider,
        bundlerUrl,
        {
          expectedSigners: [parsedPasskey.pubkeyCoordinates],
          preVerificationGasPercentageMultiplier: 120,
          verificationGasLimitPercentageMultiplier: 120,
        }
      );

      let paymaster: CandidePaymaster = new CandidePaymaster(paymasterUrl);
      let [userOperationSponsored, sponsorMetadata] =
        await paymaster.createSponsorPaymasterUserOperation(
          userOperation,
          bundlerUrl
        );
      setGasSponsor(sponsorMetadata);
      userOperation = userOperationSponsored;
      const bundlerResponse = await signAndSendUserOp(
        safeAccount,
        userOperation,
        parsedPasskey
      );
      setUserOpHash(bundlerResponse.userOperationHash);
      let userOperationReceiptResult = await bundlerResponse.included();
      if (userOperationReceiptResult.success) {
        setTxHash(userOperationReceiptResult.receipt.transactionHash);
        console.log(
          "One NTF was minted. The transaction hash is : " +
            userOperationReceiptResult.receipt.transactionHash
        );
        setUserOpHash("");
      } else {
        setError("Useroperation execution failed");
      }
    } catch (error) {
      if (error instanceof Error) {
        console.log(error);
        setError(error.message);
      } else {
        setError("Unknown error");
      }
    }
    setLoadingTx(false);
  };

  return (
    <View style={styles.card}>
      {userOpHash && (
        <View>
          <Text>
            Your account setup is in progress. This operation gas is sponsored
            by {gasSponsor?.name}
          </Text>
          <TouchableOpacity
            onPress={() => Linking.openURL(gasSponsor?.url || "")}
            style={styles.linkButton}
          >
            <Image
              source={{ uri: gasSponsor?.icons[0] }}
              style={styles.sponsorIcon}
            />
          </TouchableOpacity>

          <Text style={styles.spacer} />

          <TouchableOpacity
            onPress={() =>
              Linking.openURL(
                `https://eth-${chainName.toLowerCase()}.blockscout.com/op/${userOpHash}`
              )
            }
          >
            <Text style={styles.link}>
              Track your operation on the block explorer
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {txHash && (
        <View>
          <Text>
            You collected an NFT, secured with your Safe Account & authenticated
            by your Device Passkeys.
          </Text>
          <Text style={styles.spacer} />
          <Text>HASH: {txHash}</Text>
        </View>
      )}

      {loadingTx && !userOpHash ? (
        <Text>Preparing transaction..</Text>
      ) : (
        accountAddress && (
          <View>
            <TouchableOpacity
              onPress={handleMintNFT}
              disabled={!!userOpHash}
              style={[styles.button, !!userOpHash && styles.buttonDisabled]}
            >
              <Text style={styles.buttonText}>Mint NFT</Text>
            </TouchableOpacity>
          </View>
        )
      )}

      {error && (
        <View style={styles.card}>
          <Text style={styles.errorText}>Error: {error}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    backgroundColor: "#fff",
    borderRadius: 8,
    margin: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  sponsorIcon: {
    width: 25,
    height: 25,
  },
  spacer: {
    marginVertical: 8,
  },
  link: {
    color: "#0066cc",
    textDecorationLine: "underline",
  },
  button: {
    backgroundColor: "#007AFF",
    padding: 12,
    borderRadius: 6,
    marginTop: 8,
  },
  buttonDisabled: {
    backgroundColor: "#cccccc",
  },
  buttonText: {
    color: "#fff",
    textAlign: "center",
    fontSize: 16,
    fontWeight: "600",
  },
  errorText: {
    color: "red",
  },
  linkButton: {
    marginLeft: 5,
  },
});

export { SafeCard };
