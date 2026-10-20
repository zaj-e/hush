# Installation and distribution



**Chrome / Edge desktop:** unzip `dist/hush-0.1.5-chromium.zip` into a persistent folder. Open `chrome://extensions` or `edge://extensions`, enable Developer mode, choose **Load unpacked**, and select the extracted folder containing `manifest.json`. You can also select `dist/chromium` directly. Reload existing Instagram tabs. No store submission or signing is needed for this local unpacked workflow. After changing files, reload the extension and the Instagram tab. [Chrome instructions](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world), [Edge instructions](https://learn.microsoft.com/en-us/microsoft-edge/extensions-chromium/getting-started/extension-sideloading).

**Firefox Android:** `dist/hush-0.1.5-firefox-unsigned.xpi` is a signing input, **not a normally installable signed add-on**. Nothing has been uploaded, signed or published. For normal persistent installation, submit this build to Mozilla's developer hub using **unlisted / self-distribution**, obtain the signed XPI, and save that signed file to the phone. This requires a Mozilla developer account and may require review; unlisted signing still sends extension code to Mozilla. Then Settings → About Firefox → tap the Firefox logo five times → Settings → Install Extension from File → select the **signed** XPI → Add. Do not rename an unsigned file and expect that to sign it. [Mozilla signing overview](https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/), [official Android file-install instructions](https://extensionworkshop.com/documentation/publish/install-self-distributed/).

For temporary Android development, use an Android device/emulator with ADB and Firefox USB debugging, then `web-ext run --source-dir dist/firefox -t firefox-android --adb-device DEVICE_ID --firefox-apk org.mozilla.firefox`. Install `web-ext` separately if needed; it is not a project dependency. Temporary loading is distinct from persistent installation and needs device testing. [Mozilla Android development guide](https://extensionworkshop.com/documentation/develop/developing-extensions-for-firefox-for-android/).


