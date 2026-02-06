# SEO Image Tagger

> Professional-grade SEO metadata tool powered by Google Gemini AI. Transform your images with intelligent metadata, geotags, and SEO-optimized descriptions.

![AI Image Tagger](https://img.shields.io/badge/AI-Powered-blue) ![License](https://img.shields.io/badge/license-MIT-green) ![React](https://img.shields.io/badge/React-18-blue) ![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)

---

## 🎯 Features

### **Bulk SEO Tagger**
- **AI-Powered Metadata Generation** - Automatic titles, descriptions, alt text, and captions
- **Manual Override System** - Full control over AI suggestions with custom inputs
- **Company Information** - NAP (Name, Address, Phone) for local SEO consistency
- **Tag Category Management** - Organize keywords by Service, Product, Location, Industry, Feature
- **Location Search** - 50+ Australian suburbs with searchable database (no API needed)
- **Custom Location Presets** - Build and manage your own location library
- **EXIF Embedding** - GPS coordinates and metadata embedded in images
- **Batch Processing** - Process multiple images simultaneously
- **ZIP Download** - Download all processed images in one click

### **Tech Synthesis**
- AI-powered composite image generation
- Add technician images to service photos
- Professional branding integration

---

## 🚀 Quick Start

### Prerequisites
- Node.js (v18 or higher)
- npm or yarn
- **Google Gemini API Key** ([Get one free here](https://aistudio.google.com/app/apikey))

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/ai-image-tagger.git
   cd ai-image-tagger
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start development server**
   ```bash
   npm run dev
   ```

4. **Open in browser**
   ```
   http://localhost:5173
   ```

5. **Enter your Gemini API Key**
   - Click "Set API Key" button in the app
   - Paste your Google Gemini API key
   - Start processing images!

---

## 📖 Usage Guide

### Setting Up Your API Key

1. Visit [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Create a new API key (free tier available)
3. Copy the key
4. In the app, click **"Set API Key"** button
5. Paste your key and click **"Save"**

### Processing Images

#### **Basic Workflow**
1. **Set Company Info** - Enter name, website, phone, address
2. **Add Custom Tags** - Create tag categories for your SEO keywords
3. **Choose Location** - Search and select suburbs or enter coordinates
4. **Upload Images** - Drag & drop or click to upload
5. **Review Metadata** - AI generates optimized metadata
6. **Download** - Get your SEO-ready images with embedded EXIF data

#### **Advanced Options**
- **Manual Override** - Enable to merge custom tags with AI suggestions
- **Auto-GPS** - Randomize locations for bulk processing
- **AI Meta** - Toggle AI metadata generation on/off

### Tag Category Examples

**Service Tags:**
```
appliance repair, commercial repair, domestic repair, emergency service
```

**Location Tags:**
```
Melbourne, Brunswick, Victoria, Australia
```

**Industry Tags:**
```
HVAC, plumbing, electrical, refrigeration
```

---

## 🛠️ Configuration

### Environment Variables

Create a `.env` file in the root directory (optional for proxy setup):

```env
VITE_API_PROXY_URL=/api-proxy
```

### Proxy Configuration

The app uses Vite's proxy to avoid CORS issues with the Gemini API. Configuration is in `vite.config.ts`:

```typescript
proxy: {
  '/api-proxy': {
    target: 'https://generativelanguage.googleapis.com',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/api-proxy/, '')
  }
}
```

---

## 📁 Project Structure

```
ai-image-tagger/
├── src/
│   ├── App.tsx                 # Main application component
│   ├── types.ts                # TypeScript interfaces
│   ├── services/
│   │   ├── geminiService.ts    # AI metadata generation
│   │   └── imageProcessor.ts   # Image manipulation & EXIF
│   └── index.css               # Tailwind styles
├── public/                     # Static assets
├── HOW_TO_USE.md              # Detailed usage instructions
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

---

## 🔑 API Key Security

**Important Security Notes:**

1. **Never commit API keys** to version control
2. **Use environment variables** for production deployments
3. **Implement rate limiting** on production backends
4. **Consider a backend proxy** for enhanced security
5. **Restrict API keys** in Google Cloud Console to specific domains

### Production Deployment

For production, it's recommended to:
1. Create a backend proxy endpoint
2. Store API key server-side
3. Add authentication to your proxy
4. Implement rate limiting

---

## 🌏 Location Database

The app includes 50+ Australian suburbs covering:
- **Melbourne CBD & Inner Suburbs** - Richmond, Carlton, Fitzroy, St Kilda
- **Eastern Suburbs** - Glen Waverley, Box Hill, Ringwood, Doncaster
- **Western Suburbs** - Footscray, Sunshine, Werribee, Point Cook
- **Northern Suburbs** - Preston, Brunswick, Coburg, Craigieburn
- **Southern Suburbs** - Frankston, Cheltenham, Moorabbin
- **Geelong Region** - Geelong, Belmont, Ocean Grove
- **Mornington Peninsula** - Mornington, Rosebud, Sorrento

**No Google Maps API required** - all location data is built-in and works offline.

---

## 🎨 Technology Stack

- **Frontend:** React 18 + TypeScript
- **Build Tool:** Vite
- **AI Engine:** Google Gemini API
- **Styling:** Tailwind CSS (Vanilla CSS)
- **Image Processing:** Custom EXIF library + Canvas API
- **Compression:** JSZip for batch downloads

---

## 📝 Metadata Best Practices

### Title (Filename)
- Keep under 60 characters
- Include primary keyword
- Use descriptive, natural language

### Description
- 150-160 characters for optimal SEO
- Include location and service keywords
- Make it compelling for users

### Alt Text
- Describe what's in the image
- Include relevant keywords naturally
- Keep it accessible for screen readers

### Tags
- 5-15 tags per image
- Mix broad and specific keywords
- Include location tags for local SEO

---

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- **Google Gemini** - AI-powered metadata generation
- **Tailwind CSS** - Modern styling framework
- **Vite** - Lightning-fast build tool

---

## 📧 Support

For issues, questions, or feature requests:
- Open an issue on [GitHub](https://github.com/yourusername/ai-image-tagger/issues)
- Email: your.email@example.com

---

## 🔄 Changelog

### v2.0.0 - SEO Professional Refactor
- ✅ Removed Image Composer feature
- ✅ Added Company Information fields (NAP)
- ✅ Implemented Tag Category Manager
- ✅ Added Manual Override system
- ✅ Enhanced Location Search (50+ suburbs)
- ✅ Custom preset management
- ✅ Improved UI/UX for SEO workflows

### v1.0.0 - Initial Release
- AI-powered metadata generation
- Image enhancement
- EXIF embedding
- Batch processing

---

**Made with ❤️ for SEO professionals**
