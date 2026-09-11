# MyMusic Brand Identity Design

## Goal

Replace the app's visible MusicFree identity with MyMusic on iOS and Android, including a distinctive cross-platform icon, without changing identifiers that could split the installation or discard personal data.

## Product naming

- Display name: `MyMusic`.
- Update the React Native app display name, iOS bundle display name, Android app label and playback notification channel, launch-screen text, drawer branding, About labels, and other user-visible translations.
- Preserve the React Native module name, iOS target/project/scheme names, Android package/application ID, bundle identifier, URL scheme, repository name, and native source directory names. These are implementation identifiers and changing them would add migration risk without improving the user experience.

## Icon direction

- A premium dark square icon with a centered abstract `M` constructed from a flowing music waveform.
- Electric cyan to violet gradient, subtle dimensional glow, strong silhouette, and generous safe margins.
- No words, letters rendered as typography, borders, device mockups, or tiny details.
- The master is a 1024 by 1024 opaque PNG. Platform derivatives use the same artwork: a full-bleed iOS icon and Android legacy, round, foreground, and Play Store assets.

## Compatibility and rollout

- The updated binary replaces the existing app in place because its bundle/application identifiers remain unchanged.
- Existing settings, playlists, plugins, and language choices remain attached to the same installation.
- Tests verify visible naming, icon manifests/assets, required sizes, and preservation of internal identifiers.
- Both platform builds must pass before a signed iPhone Release is installed and launched.

## Out of scope

- Renaming the GitHub repository or native project structure.
- Changing the bundle ID, Android application ID, or deep-link scheme.
- Migrating user data to a second application identity.
