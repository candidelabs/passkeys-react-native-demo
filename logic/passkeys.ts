import { Buffer } from "buffer";
import { ethers } from "ethers";
import {
  Passkey,
  PasskeyCreateResult,
  PasskeyGetResult,
} from "react-native-passkey";
import {
  SafeAccountV0_2_0 as SafeAccount,
  SendUseroperationResponse,
  SignerSignaturePair,
  UserOperationV6,
} from "abstractionkit";
import * as cbor from "cbor-web";
import { envs } from "../envs";

const { bundlerUrl, chainId } = envs;

export type PasskeyCredentialWithPubkeyCoordinates = PasskeyCreateResult & {
  pubkeyCoordinates: WebauthPublicKey;
};

const getPasskeyWithCoordinates = async (
  passkeyCredential: PasskeyCreateResult
): Promise<PasskeyCredentialWithPubkeyCoordinates> => {
  let passkeyCredentialObj = passkeyCredential;
  if (typeof passkeyCredential === "string") {
    passkeyCredentialObj = JSON.parse(passkeyCredential);
  }
  console.log(passkeyCredentialObj);
  const attestationBuffer = Buffer.from(
    passkeyCredentialObj.response.attestationObject,
    "base64"
  );
  const decodedAttestation = await cbor.decodeFirst(attestationBuffer);
  const authData = decodedAttestation.authData;
  const flags = authData[32];
  const hasAttestedCredentialData = !!(flags & 0x40);
  if (!hasAttestedCredentialData) {
    throw new Error("No attested credential data found");
  }
  const credentialIdLength = (authData[53] << 8) | authData[54];
  const publicKeyBytes = authData.slice(55 + credentialIdLength);
  const publicKeyCose = await cbor.decodeFirst(publicKeyBytes);
  const x = publicKeyCose.get(-2);
  const y = publicKeyCose.get(-3);
  return {
    ...passkeyCredentialObj,
    pubkeyCoordinates: {
      x: BigInt("0x" + Buffer.from(x).toString("hex")),
      y: BigInt("0x" + Buffer.from(y).toString("hex")),
    },
  };
};

export type WebauthPublicKey = {
  x: bigint;
  y: bigint;
};

export const rp = {
  id: "37dd-178-19-186-193.ngrok-free.app",
  name: "Candide.dev",
};
const challenge = bufferToBase64URLString(
  crypto.getRandomValues(new Uint8Array(32))
);

export function bufferToBase64URLString(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let str = "";

  for (const charCode of bytes) {
    str += String.fromCharCode(charCode);
  }

  const base64String = btoa(str);

  return base64String.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

/**
 * Creates a passkey for signing.
 *
 * @returns A promise that resolves to a PasskeyCredentialWithPubkeyCoordinates object, which includes the passkey credential information and its public key coordinates.
 * @throws Throws an error if the passkey generation fails or if the credential received is null.
 */
async function createPasskey(): Promise<PasskeyCredentialWithPubkeyCoordinates | null> {
  const passkeyCredential: PasskeyCreateResult = await Passkey.create({
    pubKeyCredParams: [
      {
        // ECDSA w/ SHA-256: https://datatracker.ietf.org/doc/html/rfc8152#section-8.1
        alg: -7,
        type: "public-key",
      },
    ],
    challenge,
    rp,
    user: {
      displayName: "Candide.dev",
      id: bufferToBase64URLString(crypto.getRandomValues(new Uint8Array(32))),
      name: "candide",
    },
    timeout: 120000,
    attestation: "none",
    authenticatorSelection: {
      userVerification: "discouraged",
      residentKey: "preferred",
    },
  });
  console.log("passkeyCredential", passkeyCredential);

  if (!passkeyCredential) {
    throw new Error(
      "Failed to generate passkey. Received null as a credential"
    );
  }

  return getPasskeyWithCoordinates(passkeyCredential);
}

export type PasskeyLocalStorageFormat = {
  rawId: string;
  pubkeyCoordinates: {
    x: bigint;
    y: bigint;
  };
};

/**
 * Converts a PasskeyCredentialWithPubkeyCoordinates object to a format that can be stored in the backend.
 * The rawId is required for signing and pubkey coordinates are for our convenience.
 * @param passkey - The passkey to be converted.
 * @returns The passkey in a format that can be stored in the backend.
 */
function toBackendFormat(
  passkey: PasskeyCredentialWithPubkeyCoordinates
): string {
  return JSON.stringify({
    rawId: passkey.rawId,
    pubkeyCoordinates: {
      x: passkey.pubkeyCoordinates.x.toString(),
      y: passkey.pubkeyCoordinates.y.toString(),
    },
  });
}

/**
 * Extracts the signature into R and S values from the authenticator response.
 *
 * See:
 * - <https://datatracker.ietf.org/doc/html/rfc3279#section-2.2.3>
 * - <https://en.wikipedia.org/wiki/X.690#BER_encoding>
 */
function extractSignature(
  signature: ArrayBuffer | Uint8Array
): [bigint, bigint] {
  let sig: ArrayBuffer;
  if (signature instanceof Uint8Array) {
    sig = signature.buffer;
  } else {
    sig = signature;
  }

  const check = (x: boolean) => {
    if (!x) {
      throw new Error("invalid signature encoding");
    }
  };

  // Decode the DER signature. Note that we assume that all lengths fit into 8-bit integers,
  // which is true for the kinds of signatures we are decoding but generally false. I.e. this
  // code should not be used in any serious application.
  const view = new DataView(sig);

  const sequenceTag = view.getUint8(0);
  const sequenceLength = view.getUint8(1);

  console.log("Sequence tag:", sequenceTag.toString(16));
  console.log("Sequence length:", sequenceLength);
  console.log("Buffer length - 2:", view.byteLength - 2);

  // check that the sequence header is valid
  check(view.getUint8(0) === 0x30);
  check(view.getUint8(1) === view.byteLength - 2);

  // read r and s
  const readInt = (offset: number) => {
    check(view.getUint8(offset) === 0x02);
    const len = view.getUint8(offset + 1);
    const start = offset + 2;
    const end = start + len;
    const n = BigInt(
      ethers.hexlify(new Uint8Array(view.buffer.slice(start, end)))
    );
    check(n < ethers.MaxUint256);
    return [n, end] as const;
  };
  const [r, sOffset] = readInt(2);
  const [s] = readInt(sOffset);

  return [r, s];
}

export function base64URLStringToString(base64URLString: string): string {
  // Replace URL-safe characters back to standard base64 characters
  const base64 = base64URLString
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(
      base64URLString.length + ((4 - (base64URLString.length % 4)) % 4),
      "="
    );

  // Decode base64 to string
  return atob(base64);
}

/**
 * Compute the additional client data JSON fields. This is the fields other than `type` and
 * `challenge` (including `origin` and any other additional client data fields that may be
 * added by the authenticator).
 *
 * See <https://w3c.github.io/webauthn/#clientdatajson-serialization>
 */
function extractClientDataFields(
  response: PasskeyGetResult["response"]
): string {
  // Decode base64 string to JSON
  // const clientDataJSON = Buffer.from(response.clientDataJSON, 'base64').toString('utf-8');
  const clientDataJSON = base64URLStringToString(response.clientDataJSON);
  const parsedData = JSON.parse(clientDataJSON);

  console.log("Decoded clientDataJSON:", parsedData);
  // Example output:
  // {
  //   "type": "webauthn.get",
  //   "challenge": "9lhjBo21j74XrM9OpmesTJMV9E3UOiMAwgIRz0eFj7c",
  //   "origin": "https://7dcb-178-19-186-193.ngrok-free.app"
  // }

  const match = clientDataJSON.match(
    /^\{"type":"webauthn.get","challenge":"[A-Za-z0-9\-_]{43}",(.*)\}$/
  );

  if (!match) {
    throw new Error("challenge not found in client data JSON");
  }

  const [, fields] = match;
  return ethers.hexlify(ethers.toUtf8Bytes(fields));
}

const authenticatePasskey = async (): Promise<PasskeyGetResult | null> => {
  let json = await Passkey.get({
    rpId: rp.id,
    challenge,
    userVerification: "required",
    // NOTE: We can add allowCredentials if we want to authenticate with a specific passkey,
    // but we don't have credentialId (rawId) since we don't have the user details during recovery
    // ...(credentialId && {
    //   allowCredentials: [{ id: credentialId, type: 'public-key' }],
    // }),
  });
  console.log("json", json);

  if (!json) {
    throw new Error(
      "Failed to generate passkey. Received null as a credential"
    );
  }

  if (typeof json === "string") {
    json = JSON.parse(json);
  }

  const rawId = json.rawId;
  console.log("Received rawId:", rawId);
  return json;
};

async function signAndSendUserOp(
  smartAccount: SafeAccount,
  userOp: UserOperationV6,
  passkeyData: PasskeyLocalStorageFormat
): Promise<SendUseroperationResponse> {
  const safeInitOpHash = SafeAccount.getUserOperationEip712Hash(
    userOp,
    BigInt(chainId)
  );

  console.log(passkeyData, "passkeyData");

  let assertion = await Passkey.get({
    rpId: rp.id,
    challenge: bufferToBase64URLString(ethers.getBytes(safeInitOpHash)),
    userVerification: "required",
    allowCredentials: [{ id: passkeyData.rawId, type: "public-key" }],
  });

  if (!assertion) {
    throw Error("assertion null");
  }

  if (typeof assertion === "string") {
    assertion = JSON.parse(assertion);
  }

  const signatureBase64 = assertion.response.signature;
  const signatureBuffer = Buffer.from(signatureBase64, "base64");

  const webauthnSignatureData = {
    authenticatorData: Buffer.from(
      assertion.response.authenticatorData,
      "base64"
    ).buffer,
    clientDataFields: extractClientDataFields(assertion.response),
    rs: extractSignature(signatureBuffer),
  };

  console.log("webauthnSignatureData", webauthnSignatureData);

  const webauthSignature: string = SafeAccount.createWebAuthnSignature(
    webauthnSignatureData
  );

  const SignerSignaturePair: SignerSignaturePair = {
    signer: passkeyData.pubkeyCoordinates,
    signature: webauthSignature,
  };

  userOp.signature = SafeAccount.formatSignaturesToUseroperationSignature(
    [SignerSignaturePair],
    {
      isInit: userOp.nonce == 0n,
    }
  );
  console.log(userOp, "userOp");
  return await smartAccount.sendUserOperation(userOp, bundlerUrl);
}

interface WebAuthnVerificationData {
  signature: string;
  clientDataJSON: string;
  authenticatorData: string;
}

async function signAuthenticationMessage(
  message: string,
  rawId: string
): Promise<WebAuthnVerificationData> {
  const messageHash = ethers.hashMessage(message);

  let assertion = await Passkey.get({
    rpId: rp.id,
    challenge: bufferToBase64URLString(ethers.getBytes(messageHash)),
    userVerification: "required",
    allowCredentials: [{ id: rawId, type: "public-key" }],
  });

  if (!assertion) {
    throw Error("Passkey assertion failed");
  }

  if (typeof assertion === "string") {
    assertion = JSON.parse(assertion);
  }

  return {
    signature: assertion.response.signature,
    clientDataJSON: assertion.response.clientDataJSON,
    authenticatorData: assertion.response.authenticatorData,
  };
}

const isPasskeySupported = Passkey.isSupported();

export {
  createPasskey,
  isPasskeySupported,
  toBackendFormat,
  authenticatePasskey,
  extractClientDataFields,
  extractSignature,
  signAndSendUserOp,
  signAuthenticationMessage,
};

// NOTE: these functions can be useful for testing singing with passkeys and debug future errors
// const textx = async (
//   safeWallet: SafeWallet,
//   passkeyAddress: string,
//   passkey: PasskeyCredentialWithPubkeyCoordinates,
// ) => {
//   // NOTE: only for testing purposes
//   try {
//     const nftContractAddress = '0x9a7af758aE5d7B6aAE84fe4C5Ba67c041dFE5336';
//     const mintFunctionSignature = 'mint(address)';
//     const mintFunctionSelector = getFunctionSelector(mintFunctionSignature);
//     const mintTransactionCallData = createCallData(
//       mintFunctionSelector,
//       ['address'],
//       [accountAddress],
//     );
//     const mintTransaction: MetaTransaction = {
//       to: nftContractAddress,
//       value: 0n,
//       data: mintTransactionCallData,
//     };
//     const safeAccount = SafeAccount.initializeNewAccount([passkey.pubkeyCoordinates], {
//       eip7212WebAuthnPrecompileVerifierForSharedSigner:
//         '0x0000000000000000000000000000000000000100',
//     });
//     let userOperation = await safeAccount.createUserOperation(
//       [mintTransaction],
//       jsonRPCProvider,
//       bundlerUrl,
//       {
//         expectedSigners: [passkey.pubkeyCoordinates],
//         preVerificationGasPercentageMultiplier: 120,
//         verificationGasLimitPercentageMultiplier: 120,
//       },
//     );
//     let paymaster: CandidePaymaster = new CandidePaymaster(paymasterRPC);
//     let [userOperationSponsored, sponsorMetadata] =
//       await paymaster.createSponsorPaymasterUserOperation(userOperation, bundlerUrl);
//     userOperation = userOperationSponsored;
//     const bundlerResponse = await signAndSendUserOp(safeAccount, userOperation, passkey);
//     let userOperationReceiptResult = await bundlerResponse.included();
//     console.log('userOperationReceiptResult', userOperationReceiptResult);
//     if (userOperationReceiptResult.success) {
//       console.log(
//         'One NTF was minted. The transaction hash is : ' +
//           userOperationReceiptResult.receipt.transactionHash,
//       );
//     }
//   } catch (error) {
//     const err = parseAbstractionKitError(error);
//     console.error('Error mintNFTPasskey', err);
//   }
// };
// const textx2 = async (
//   safeWallet: SafeWallet,
//   passkeyAddress: string,
//   passkey: PasskeyCredentialWithPubkeyCoordinates,
// ) => {
//   // NOTE: only for testing purposes
//   try {
//     const newOnDeviceWallet = createWallet();
//     const newOwner = newOnDeviceWallet.address;
//     // get owners
//     const owners = (await safeWallet.getOwners()) as string[];
//     // get the previous owner, right before the old owner in the list
//     // Get the older owner in the list, through deduction instead
//     // Find the index which does not correspond to the onDeviceWallet and the magic wallet
//     const excludedOwners = [passkeyAddress];
//     // From owners, filter out the excluded owners
//     console.log('Cloud wallet address: ', passkeyAddress);
//     console.log('Excluded owners: ', excludedOwners);
//     console.log('new owner', newOwner);
//     console.log('owners', owners);
//     const toBeReplacedIndex = owners.findIndex((owner) => !excludedOwners.includes(owner));
//     console.log('To be replaced index: ', toBeReplacedIndex);
//     const oldOwner = owners[toBeReplacedIndex];
//     const transactions = await safeWallet.safeAccount.createSwapOwnerMetaTransactions(
//       envs?.POLYGON_RPC_URL,
//       newOwner,
//       oldOwner,
//     );
//     // const safeAccount = SafeAccount.initializeNewAccount([passkey.pubkeyCoordinates], {
//     //   eip7212WebAuthnPrecompileVerifierForSharedSigner:
//     //     '0x0000000000000000000000000000000000000100',
//     // });
//     let userOperation = await safeWallet.safeAccount.createUserOperation(
//       transactions,
//       jsonRPCProvider,
//       bundlerUrl,
//       {
//         expectedSigners: [passkey.pubkeyCoordinates],
//         preVerificationGasPercentageMultiplier: 120,
//         verificationGasLimitPercentageMultiplier: 120,
//       },
//     );
//     let paymaster: CandidePaymaster = new CandidePaymaster(paymasterRPC);
//     let [userOperationSponsored, sponsorMetadata] =
//       await paymaster.createSponsorPaymasterUserOperation(userOperation, bundlerUrl);
//     console.log('userOperationSponsored', userOperationSponsored);
//     userOperation = userOperationSponsored;
//     const bundlerResponse = await signAndSendUserOp(
//       safeWallet.safeAccount,
//       userOperation,
//       passkey,
//     );
//     let userOperationReceiptResult = await bundlerResponse.included();
//     console.log('userOperationReceiptResult', userOperationReceiptResult);
//     if (userOperationReceiptResult.success) {
//       console.log(
//         'The transaction hash is : ' + userOperationReceiptResult.receipt.transactionHash,
//       );
//     }
//   } catch (error) {
//     const err = parseAbstractionKitError(error);
//     console.error('Error textx', err);
//   }
// };
// const mintNFTMultisig = async (
//   safeWallet: SafeWallet,
//   passkey: PasskeyCredentialWithPubkeyCoordinates,
//   address: string,
// ) => {
//   // NOTE: only for testing purposes
//   try {
//     await safeWallet.getOwners();
//     const nftContractAddress = '0x9a7af758aE5d7B6aAE84fe4C5Ba67c041dFE5336';
//     const mintFunctionSignature = 'mint(address)';
//     const mintFunctionSelector = getFunctionSelector(mintFunctionSignature);
//     const mintTransactionCallData = createCallData(mintFunctionSelector, ['address'], [address]);
//     const mintTransaction: MetaTransaction = {
//       to: nftContractAddress,
//       value: 0n,
//       data: mintTransactionCallData,
//     };
//     let userOperation = await safeWallet.safeAccount.createUserOperation(
//       [mintTransaction],
//       jsonRPCProvider,
//       bundlerUrl,
//       {
//         expectedSigners: [passkey.pubkeyCoordinates],
//         preVerificationGasPercentageMultiplier: 120,
//         verificationGasLimitPercentageMultiplier: 120,
//         eip7212WebAuthnPrecompileVerifier: '0x0000000000000000000000000000000000000100',
//       },
//     );
//     let paymaster: CandidePaymaster = new CandidePaymaster(paymasterRPC);
//     let [userOperationSponsored, sponsorMetadata] =
//       await paymaster.createSponsorPaymasterUserOperation(userOperation, bundlerUrl);
//     userOperation = userOperationSponsored;
//     const bundlerResponse = await signAndSendUserOp(
//       safeWallet.safeAccount,
//       userOperation,
//       passkey,
//     );
//     let userOperationReceiptResult = await bundlerResponse.included();
//     console.log('userOperationReceiptResult', userOperationReceiptResult);
//     if (userOperationReceiptResult.success) {
//       console.log(
//         'One NTF was minted. The transaction hash is : ' +
//           userOperationReceiptResult.receipt.transactionHash,
//       );
//     }
//   } catch (error) {
//     const err = parseAbstractionKitError(error);
//     console.error('Error mintNFTMultisig', err);
//   }
// };
