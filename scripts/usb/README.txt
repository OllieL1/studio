STUDIO
======

START
  Mac:      double-click "Start Studio.command"
  Windows:  double-click "Start Studio.bat"

  A window opens, Studio starts, and your browser opens at
  http://studio.localhost:3111 (or http://localhost:3111 on a computer that
  doesn't know the name yet).

  To use the short name on a new computer, run this once:
    Mac/Linux   echo "127.0.0.1  studio.localhost" | sudo tee -a /etc/hosts
    Windows     add "127.0.0.1  studio.localhost" to
                C:\Windows\System32\drivers\etc\hosts (as Administrator)
  It is optional - Studio works either way. Keep the ".localhost" on the end:
  Safari forces HTTPS on a plain name and then refuses to connect.
  Keep that window open while you use Studio.

STOP
  Close the Studio window, then EJECT the stick before unplugging it:
    Mac:      drag the stick to the Bin, or right-click > Eject
    Windows:  "Safely Remove Hardware" in the taskbar

  Pulling the stick out while Studio is running can damage your data.

WHAT'S HERE
  studio/data/studio.db   your data - everything you've logged
  studio/app/             the website itself
  studio/runtime/         Node for Mac and Windows (nothing to install)
  studio/config.env       Google Calendar and Spotify credentials

IF THE STICK IS LOST
  Your study data is on it, and so is access to your Google Calendar and
  Spotify. Revoke that access straight away:
    Google:   myaccount.google.com/permissions  > find your Studio app > Remove access
    Spotify:  spotify.com/account/apps          > find your Studio app > Remove access
  Then restore your data onto a new stick (below).

BACKUPS
  Every time you log a session, all your data is copied to the computer
  you're using, replacing the previous copy:
    Documents/Studio Backups/studio-backup.db
  Each computer holds a copy as of the last session studied on it - use
  whichever is newer (Settings in Studio shows when each was taken).

RESTORING ONTO A NEW STICK
  1. Format the new stick as FAT32 (MS-DOS) and name it STUDIO.
  2. On the Mac, run:  npm run usb:deploy
  3. Copy studio-backup.db from Documents/Studio Backups onto the stick,
     replacing studio/data/studio.db (rename it to studio.db).

UPDATING
  New versions are put on the stick from the Mac with:  npm run usb:deploy
  That never overwrites your data.
