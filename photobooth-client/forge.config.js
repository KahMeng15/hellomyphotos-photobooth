const { execSync } = require('child_process')
const path = require('path')

module.exports = {
  packagerConfig: {
    name: 'hellomyphoto Booth',
    executableName: 'hellomyphoto-booth',
    asar: true,
    icon: './assets/icons/icon',
    appBundleId: 'com.hellomyphoto.booth',
    osxSign: {},
    osxNotarize: undefined,
  },
  makers: [
    {
      name: '@electron-forge/maker-dmg',
      config: {
        background: './assets/icons/dmg-background.png',
        icon: './assets/icons/icon.icns',
      },
    },
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'hellomyphoto-booth',
        iconUrl: 'https://raw.githubusercontent.com/hellomyphoto/booth/main/assets/icons/icon.ico',
        setupIcon: './assets/icons/icon.ico',
      },
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin', 'linux'],
    },
    {
      name: '@electron-forge/maker-deb',
      config: {
        options: {
          icon: './assets/icons/icon.png',
        },
      },
    },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-auto-unpack-natives',
      config: {},
    },
  ],
  hooks: {
    prePackage: async () => {
      execSync('npx tsc', { cwd: __dirname, stdio: 'inherit' })
      execSync('npx esbuild src/renderer/app.ts --bundle --outfile=dist/renderer/app.js --platform=browser --format=iife --global-name=BoothApp', { cwd: __dirname, stdio: 'inherit' })
    },
  },
}
