# Minecraft Music Extractor (Chrome Extension)

![Minecraft Style](https://img.shields.io/badge/Style-Minecraft-green?style=for-the-badge)
![License](https://img.shields.io/badge/License-MIT-purple?style=for-the-badge)

A minimalist music player for your browser that uses the original audio files from your **Minecraft** installation. Play both the OST and In-game Music Discs with ease! ;)

<div align="center">
  <img src=".github/images/gif1.gif" />
</div>

---

## Features
* **Themed UI:** Pixel-art interface inspired by Minecraft's original GUI.
* **Cohesive Design:** A clean and smooth interface built for **fast navigation**.
* **Visual Themes:** Switch between different color palettes.
* **Total Privacy:** The extension does not include any music files. It reads them directly from your local `assets` folder (so legal).

<div align="center">
  <img src=".github/images/webp1.webp" />
</div>

---

## How to Setup
To make the player work, you must point it to your game's sound files:

1. Install the extension in your browser.
2. Open the extension **Settings**.
3. Click on **"Select Assets Folder"**.
4. Locate your Minecraft assets folder (usually found at `.minecraft/assets`).
5. Done! The player will automatically organize the discs and the soundtrack for you.

<div align="center">
  <img src=".github/images/gif2.gif" />
</div>

---

## Legal Disclaimer
This project **does not distribute, include, or download** any copyrighted audio files. It is a software tool that allows users to play files they already legally own on their local machine.

*Minecraft is a registered trademark of Mojang Synergies AB. This project is not affiliated with or endorsed by Mojang or Microsoft.*

---

## Developer Installation
```bash
git clone [https://github.com/SandiaExe/mc-music-extractor.git](https://github.com/SandiaExe/mc-music-extractor.git)
cd mc-music-extractor
# Load the folder in chrome://extensions by enabling "Developer mode"
