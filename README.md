Nyx — Brave extension

![screenshot](/assets/screenshots/screenshoot.png)

Make your new tab feel like a personal command center.
This project is a beautiful, modern Brave extension that replaces the ordinary new-tab page with something more useful, stylish, and personal. Instead of staring at a blank or generic page, you get a fast workspace for your favorite links, a live dashboard, immersive wallpapers, and a smooth local media experience.

Why users love it
- It turns every new tab into a productive and enjoyable start point.
- It feels premium and polished without being complicated to use.
- It helps you stay organized with grouped shortcuts, pinned links, and quick actions.
- It gives your browser a personal identity with dynamic colors and custom backgrounds.
- It supports local music playback, so your media experience stays private and fast.

Main features
- Fast access to favorite websites through organized link groups and pinned shortcuts
- Beautiful wallpaper support with image and video backgrounds
- Smart accent colors that adapt to your wallpaper automatically
- Command mode for quick customization using simple keyboard commands
- A dashboard with weather, date, calendar, profile, and system information
- A media section for local audio playback
- Optional backend support for browsing and streaming your music library from a local server

What makes it special
This extension is designed for people who want more from their browser. Whether you use Brave for work, study, design, coding, or everyday browsing, this page helps you feel more in control. It combines convenience, customization, and style in one lightweight experience.

Installation
1. Copy or unzip this folder somewhere permanent.
2. Open brave://extensions
3. Turn on Developer mode.
4. Click Load unpacked and select this project folder.
5. Open a new tab to start using the extension.

Customize your experience
Edit js/config.js to change:
- your link groups and shortcuts
- your name and city
- dock pins and favorites
- tab names and layout settings

Command mode
Type > in the search bar to use quick commands such as:
- >wall              pick a wallpaper image or video
- >wall reset        restore the default wallpaper
- >accent auto       generate colors from the wallpaper
- >accent #hex       set a manual accent color
- >name X            change the greeting name
- >city X            change the weather city
- >tab X             switch between tabs
- >dock              toggle the dock
- >reset             reset saved settings

Dashboard experience
Use Alt+D (or Alt+K if Brave uses it) to open the dashboard.
The dashboard includes:
- Dashboard tab for weather, profile, date, and calendar
- Media tab for local music playback
- System tab for battery, memory, storage, and network details

Local music server
This project also includes a backend music server in the backend folder.
To run it:
- install .NET 8 SDK
- open the backend folder
- run run.bat on Windows or ./run.sh on Linux/macOS
- or run: dotnet run -c Release

The music server listens on http://127.0.0.1:5055 by default and lets you browse and stream your local music library.

Project files
- manifest.json      extension configuration
- index.html         page layout
- css/style.css      main styling
- js/config.js       your personal links and settings
- js/app.js          clock, weather, search, and tabs
- js/theme.js        wallpaper and color logic
- js/commands.js     command palette and dock behavior
- backend/           local music server for media playback

Built for people who want their browser to feel more like a personal workspace than a blank page.
