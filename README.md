# Asset Master SEO Tagger

Asset Master is a high-performance web application designed for service professionals to automate image optimization for SEO and digital marketing. It leverages the Google Gemini API to analyze images and embed rich, search-engine-friendly metadata directly into image files.

## 🚀 Key Features

- **Bulk AI Tagging**: Upload multiple images and let Gemini 2.5 Flash generate SEO-optimized filenames, Alt text, descriptions, and social media captions.
- **Windows Details Tab Compatibility**: Automatically populates "Title", "Subject", "Tags", "Comments", "Authors", and "Copyright" fields using special Windows-specific EXIF tags (XPTitle, XPSubject, etc.).
- **Geo-Targeted GPS Embedding**: Manually select locations, use your browser's GPS, or use the **Random GPS** feature to shuffle locations from a preset list (ideal for local SEO coverage).
- **AI Image Enhancement**: Automatically cleans, sharpens, and improves image vibrancy using Gemini's vision-to-image capabilities.
- **Tech Merge (Composite Creator)**: Realistically insert a technician from one photo into an appliance scene from another, creating professional action shots without high-end editing software.
- **HEIC Support**: Automatically converts iPhone HEIC photos to web-standard JPEG.
- **Bulk Export**: Download all processed and tagged assets in a single organized ZIP file.

## 🛠 Tech Stack

- **React 19**: Modern UI component architecture.
- **Tailwind CSS**: High-performance, responsive styling.
- **Google Gemini API**: Advanced vision and image generation models.
- **Piexifjs**: Client-side EXIF/GPS metadata manipulation.
- **JSZip**: In-browser ZIP generation for bulk downloads.

## 📦 Usage

1. **Configure Identity**: Set your business name to ensure consistent branding in tags and copyright fields.
2. **Set GEO Target**: Pick a target suburb or enable "Random GPS" for bulk uploads.
3. **Upload**: Drag and drop your project photos.
4. **Review & Edit**: AI-generated metadata is fully editable before final download.
5. **Download**: Grab individual optimized JPEGs or a bulk ZIP.

## 🔒 Security & Privacy

- **Client-Side Processing**: Image processing (resizing, HEIC conversion, EXIF embedding) happens directly in your browser.
- **API Security**: Sensitive API keys are managed via environment variables and never stored in the source code.
