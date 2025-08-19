# Setting Up Your App Icon

## Current Status
The app is currently running with a default placeholder icon. To use your custom icon:

## Option 1: Convert SVG to PNG (Recommended)
1. Open the `public/icon.svg` file in a web browser
2. Take a screenshot or use browser dev tools to save as PNG
3. Save as `public/icon.png` (512x512 pixels recommended)
4. Uncomment the icon line in `public/electron.js`

## Option 2: Use Online Converters
- [Convertio](https://convertio.co/svg-png/)
- [CloudConvert](https://cloudconvert.com/svg-to-png)
- [Online-Convert](https://image.online-convert.com/convert-to-png)

## Option 3: Command Line (macOS/Linux)
```bash
# Install ImageMagick first
brew install imagemagick  # macOS
sudo apt-get install imagemagick  # Ubuntu/Debian

# Convert SVG to PNG
convert public/icon.svg -resize 512x512 public/icon.png
```

## Option 4: Design Software
- **Figma**: Export SVG as PNG
- **Sketch**: Export as PNG
- **Adobe Illustrator**: Save as PNG
- **GIMP**: Import SVG, export as PNG

## Icon Requirements
- **Format**: PNG
- **Size**: 512x512 pixels (recommended)
- **Location**: `public/icon.png`
- **Transparency**: Supported

## After Creating Icon
1. Place `icon.png` in the `public/` folder
2. Uncomment this line in `public/electron.js`:
   ```javascript
   icon: path.join(__dirname, 'icon.png'),
   ```
3. Restart the Electron app

## Testing
Run `npm run electron` to test with your new icon!
