
# Passkeys Demo App

This repository contains a demo application showcasing passkey authentication implementation in Expo with abstractionkit.

## Prerequisites

Before running the application, you need to set up a few things:

### 1. Environment Variables

Fill a `envs.ts` file in the root directory and fill in the required variables.

### 2. Web Server Configuration

The passkey functionality requires two configuration files to be hosted on your web server:

- `.well-known/apple-app-site-association`
- `.well-known/assetlinks.json`

### Local Development Setup

For local development, you can use the included `passkeys-server` which simulates these configuration files using Express.js.

1. Configure the server by updating:
   - `appIdentifier` 
   - `package_name`
   - `sha256_cert_fingerprints`

2. The passkeys server requires a tunneling service (like ngrok) to be accessible:
   ```bash
   # Start the server
   npm start
   
   # In a separate terminal, start ngrok
   ngrok http 3006
   ```

3. Update the RP ID:
   - Search for all occurrences of "37dd-178-19-186-193.ngrok-free.app" in the codebase
   - Replace them with your ngrok URL (without the https:// prefix)

## Running the App

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the expo server and install the app on your device:
   ```bash
   npm run android / npm run ios
   ```
