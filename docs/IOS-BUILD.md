# iOS Build Guide

This doc is for when you're ready to put Math Warriors on a real iPad or submit to the App Store. It's a step-by-step that assumes you've never done this before.

## What you need

- **A Mac.** Required. Xcode only runs on macOS. Any Mac from the last ~5 years works.
- **Xcode.** Free from the Mac App Store. Big download (~15GB). Only needed for the final build step; day-to-day dev happens in the browser as usual.
- **An Apple ID.** Free. Used to sign your own builds for your own devices.
- **An Apple Developer Program membership.** Only needed when you want to ship to the App Store. **$99/year.** You can skip this for personal testing.
- **A physical iPad.** Optional but recommended. The Xcode iPad simulator is fine for most testing, but a real device is the final test.

## Step 0: Install Node and clone the repo

On your Mac:

```bash
# Install Homebrew (https://brew.sh) if you don't have it
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install Node.js
brew install node

# Clone the repo
git clone https://github.com/DD-Builder/Math-Warriors.git
cd Math-Warriors

# Install dependencies
npm install
```

## Step 1: Verify the web build works

Before wrapping with Capacitor, make sure the plain web version builds:

```bash
npm run build
npm run preview
```

Open the URL Vite prints (usually `http://localhost:4173`). The game should load. If it doesn't, fix that first.

## Step 2: Install Capacitor iOS

```bash
npm install @capacitor/core @capacitor/cli @capacitor/ios
```

This adds Capacitor's runtime + iOS platform adapter to `node_modules`.

## Step 3: Generate the Xcode project

```bash
npx cap add ios
```

This creates an `ios/` directory at the repo root with a fully-formed Xcode project inside. It reads config from `capacitor.config.json` (already committed).

> **Note:** the `ios/` folder is `.gitignore`d — it's generated, not source. Don't commit it.

## Step 4: Sync the web build into the Xcode project

Every time you change web code:

```bash
npm run build           # produce dist/
npx cap sync ios        # copy dist/ into the Xcode project
```

You can combine these with a script. Add to `package.json` if you want:

```json
"scripts": {
  "ios:sync": "npm run build && npx cap sync ios",
  "ios:open": "npx cap open ios"
}
```

## Step 5: Open in Xcode

```bash
npx cap open ios
```

This launches Xcode with the project. On first open, Xcode may ask to set up signing — follow the prompts:

1. Click the project root in the left sidebar (the top `App` item with the blue Xcode icon).
2. Under **Signing & Capabilities**:
   - Check **Automatically manage signing**
   - Choose your **Team** from the dropdown. If you have an Apple ID, a free personal team should appear.
3. Xcode will generate a provisioning profile.

## Step 6: Build to the simulator

1. In the top bar of Xcode, pick a simulator (e.g., **iPad Pro 12.9"**) from the device dropdown.
2. Hit **⌘+R** (or the Play button).
3. Xcode compiles and launches the simulator.

The game should appear inside the simulator. Touch targets work via mouse clicks.

## Step 7: Build to a real iPad

1. Plug your iPad into the Mac with a cable. Trust the computer when prompted on the iPad.
2. In Xcode, pick your iPad from the device dropdown (it'll appear at the top of the list).
3. Hit **⌘+R**.
4. First time: the iPad will refuse to launch an untrusted developer. Go to **Settings → General → VPN & Device Management** on the iPad, tap your Apple ID under "Developer App," and tap **Trust**.
5. Launch the app from the iPad home screen.

**The game now runs natively on your iPad.** You can Add to Home Screen and use it offline.

## Step 8: Submit to the App Store (later)

This is only for when the game is truly ready to ship to the public.

1. Join the [Apple Developer Program](https://developer.apple.com/programs/) ($99/year).
2. In [App Store Connect](https://appstoreconnect.apple.com), create a new app record:
   - Bundle ID: `com.ddbuilder.mathwarriors` (matches `capacitor.config.json`)
   - Name: Math Warriors
   - Primary language: English
   - Category: Education, Games / Educational, Games / Role Playing
   - Age rating: 4+
3. In Xcode, change the build target from **Debug** to **Release**.
4. **Product → Archive**. Xcode builds a release archive.
5. In the Archives window, click **Distribute App**.
6. Choose **App Store Connect** → **Upload**.
7. Xcode uploads the build to App Store Connect.
8. Back on the web, fill in:
   - Screenshots (iPad 12.9" required, iPad 11" required)
   - App description
   - Keywords
   - Privacy policy URL (even if you collect nothing, you need to say so)
   - Privacy nutrition labels (probably all "no" for this game)
9. Submit for review. Apple takes 24–48 hours typically.
10. If accepted, ship it.

## Common issues

### "Could not find device to deploy to"

Your iPad is locked. Unlock it and plug back in.

### "Failed to register bundle identifier"

Your Apple ID isn't enrolled in a paid developer program OR someone else already claimed this bundle ID. Change `appId` in `capacitor.config.json`, then run `npx cap sync ios` and rebuild.

### The game is sized wrong on iPad

Check that `capacitor.config.json` has the right `ios` block (it does in the committed version). Also verify `index.html` has the viewport meta tag with `viewport-fit=cover`.

### Audio doesn't play on device

iOS requires a user gesture before any audio can start. Make sure audio isn't triggered before the first tap. Our `audio.playMusic()` already handles this correctly.

### Fonts don't load on device (offline)

Our production game loads Google Fonts. If you want offline fonts for App Store distribution, download the font files into `public/assets/fonts/` and use a CSS `@font-face` declaration instead of the `<link>` tag. Not required for v1.0 but nice to have.

## What's NOT in this guide

- **Code signing for distribution.** Xcode's automatic signing handles dev and ad-hoc builds. Distribution signing is more involved and should be figured out in the release sprint.
- **App Store optimization.** Keywords, descriptions, screenshots. All come later.
- **Parental gate.** Apple requires one if you have any "leave the app" links. Math Warriors currently has no external links, so this isn't required yet.
- **IAP.** In-app purchases are explicitly out of scope for v1.0 per [`DESIGN-PRINCIPLES.md`](DESIGN-PRINCIPLES.md).
- **GameCenter.** Nice to have. Adding it is a post-1.0 enhancement.
