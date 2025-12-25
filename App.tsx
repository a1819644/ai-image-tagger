
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { generateImageMetadata, enhanceImage, addTechToImage, composeImages } from './services/geminiService';
import { embedMetadata, resizeImage, upscaleImageToHeight, convertBlobToJpegDataURL, getImageDimensions, validateImageDimensions } from './services/imageProcessor';
import type { Metadata, ProcessingOptions, GeoLocation } from './types';

// @ts-ignore
import JSZip from 'jszip';


type AppMode = 'tagger' | 'techAdder' | 'composer';
type ImageStatus = 'pending' | 'generating' | 'enhancing' | 'embedding' | 'ready' | 'error';

interface ProcessedImage {
  id: string;
  file: File;
  previewUrl: string;
  status: ImageStatus;
  statusText: string;
  metadata: Metadata | null;
  enhancedImage: string | null; // base64 data url
  finalImageBlob: Blob | null;
  error: string | null;
  appliedOptions: ProcessingOptions;
  appliedLocation: GeoLocation;
}

const PRESET_LOCATIONS: GeoLocation[] = [
    { name: 'Melbourne (CBD)', lat: -37.814000, lng: 144.963320 },
    { name: 'Richmond', lat: -37.8220, lng: 144.9930 },
    { name: 'Werribee', lat: -37.9000, lng: 144.6400 },
    { name: 'Preston', lat: -37.7430, lng: 145.0000 },
    { name: 'Dandenong', lat: -37.9820, lng: 145.2230 },
    { name: 'Footscray', lat: -37.8010, lng: 144.9020 },
    { name: 'Box Hill', lat: -37.8190, lng: 145.1220 },
    { name: 'Frankston', lat: -38.1430, lng: 145.1270 },
    { name: 'St Kilda', lat: -37.8640, lng: 144.9820 },
    { name: 'Brunswick', lat: -37.7670, lng: 144.9590 },
];

// --- Helper Functions ---

const slugify = (text: string): string => {
    return text
        .toString()
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')           // Replace spaces with -
        .replace(/[^\w\-]+/g, '')       // Remove all non-word chars
        .replace(/\-\-+/g, '-')         // Replace multiple - with single -
        .replace(/^-+/, '')             // Trim - from start of text
        .replace(/-+$/, '');            // Trim - from end of text
};

const handleFileConversion = async (file: File): Promise<File> => {
    const fileName = file.name.toLowerCase();
    const isHeic = fileName.endsWith('.heic') || fileName.endsWith('.heif') || file.type === 'image/heic' || file.type === 'image/heif';

    // @ts-ignore
    if (isHeic && window.heic2any) {
        try {
            // @ts-ignore
            const conversionResult = await window.heic2any({
                blob: file,
                toType: "image/jpeg",
                quality: 0.9,
            });
            const convertedBlob = Array.isArray(conversionResult) ? conversionResult[0] : conversionResult;
            const newFileName = file.name.replace(/\.(heic|heif)$/i, '.jpeg');
            return new File([convertedBlob], newFileName, { type: 'image/jpeg' });
        } catch (error) {
            console.error("HEIC conversion failed:", error);
            return file; 
        }
    }
    return file;
};


// --- Helper Components ---

const ApiKeyOverlay: React.FC<{onSelectKey: () => void}> = ({onSelectKey}) => (
    <div className="fixed inset-0 bg-slate-900 bg-opacity-95 backdrop-blur-md z-50 flex items-center justify-center p-4">
        <div className="text-center max-w-lg bg-slate-800 p-10 rounded-3xl border border-slate-700 shadow-2xl relative overflow-hidden">
             <div className="absolute -top-10 -right-10 w-40 h-40 bg-cyan-600/10 blur-3xl"></div>
            <svg xmlns="http://www.w3.org/2000/svg" className="mx-auto h-20 w-20 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
            </svg>
            <h2 className="mt-6 text-3xl font-black text-white uppercase tracking-tighter italic">AI KEY REQUIRED</h2>
            <p className="mt-4 text-slate-400 text-sm font-medium leading-relaxed">
                Asset Master uses Gemini 3.0 Pro for high-end image synthesis. 
                Please select a paid API key from a billing-enabled project to begin.
            </p>
            <button onClick={onSelectKey} className="mt-8 w-full bg-cyan-600 hover:bg-cyan-500 text-white font-black py-4 px-6 rounded-2xl transition-all shadow-xl shadow-cyan-900/30 uppercase tracking-widest text-sm active:scale-95">
                Select API Key
            </button>
            <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noopener noreferrer" className="mt-4 block text-[10px] text-slate-500 uppercase tracking-widest hover:text-cyan-400 transition-colors">
                Learn about billing setup
            </a>
        </div>
    </div>
);


const DragOverlay: React.FC = () => (
    <div className="fixed inset-0 bg-slate-900 bg-opacity-80 backdrop-blur-sm z-50 flex items-center justify-center pointer-events-none">
        <div className="text-center">
            <svg className="mx-auto h-24 w-24 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <h2 className="mt-4 text-2xl font-bold text-white">Drop images anywhere to start</h2>
        </div>
    </div>
);

const Uploader: React.FC<{ onFilesAdded: (files: File[]) => void, dragActive: boolean, setDragActive: React.Dispatch<React.SetStateAction<boolean>>, setGlobalDragActive: React.Dispatch<React.SetStateAction<boolean>> }> = ({ onFilesAdded, dragActive, setDragActive, setGlobalDragActive }) => {
    const inputRef = useRef<HTMLInputElement>(null);

    const handleFiles = (files: FileList | null) => {
        if (files && files.length > 0) {
            onFilesAdded(Array.from(files).slice(0, 20));
        }
    };

    const handleDrag = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === 'dragenter' || e.type === 'dragover') {
            setDragActive(true);
        } else if (e.type === 'dragleave') {
            setDragActive(false);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        setGlobalDragActive(false); 
        if (e.dataTransfer.files) {
            handleFiles(e.dataTransfer.files);
        }
    };

    return (
        <div onDragEnter={handleDrag} onDragOver={handleDrag} onDragLeave={handleDrag} onDrop={handleDrop}
             className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors duration-200 cursor-pointer ${dragActive ? 'border-cyan-400 bg-slate-700' : 'border-slate-700 hover:border-cyan-400'}`}
             onClick={() => inputRef.current?.click()}>
            <input ref={inputRef} type="file" multiple accept="image/*,.heic,.heif" className="hidden" onChange={(e) => handleFiles(e.target.files)} />
            <p className="text-slate-300 font-bold uppercase tracking-wide text-sm">{dragActive ? 'Release to Upload' : 'Drag & Drop Project Photos'}</p>
            <p className="text-[10px] text-slate-500 mt-2 uppercase tracking-widest font-medium">Supports Multi-Upload & HEIC</p>
        </div>
    );
};

const ImageCard: React.FC<{ 
    image: ProcessedImage, 
    onMetadataChange: (id: string, newMetadata: Metadata) => void, 
    onDownload: (id: string) => void, 
    isDownloading: string | null,
    onRetry?: () => void,
    showRetry?: boolean,
    isRetrying?: boolean
}> = ({ image, onMetadataChange, onDownload, isDownloading, onRetry, showRetry = false, isRetrying = false }) => {
    const handleFieldChange = (field: keyof Metadata, value: string | string[]) => {
        if (image.metadata) {
            onMetadataChange(image.id, { ...image.metadata, [field]: value });
        }
    };

    return (
        <div className="bg-slate-800 rounded-3xl p-5 flex flex-col md:flex-row gap-6 border border-slate-700 shadow-2xl hover:border-slate-600 transition-all group">
            <div className="flex-shrink-0 w-full md:w-1/3">
                <div className="relative overflow-hidden rounded-2xl border border-slate-700 shadow-inner">
                    <img src={image.enhancedImage || image.previewUrl} alt="Preview" className="w-full h-auto object-cover transform transition-transform group-hover:scale-105" />
                    {image.status === 'ready' && image.appliedOptions.enhanceImage && (
                        <div className="absolute top-3 right-3 bg-cyan-600 text-[9px] font-black px-2 py-1 rounded-lg uppercase tracking-widest shadow-xl">AI-Enhanced</div>
                    )}
                </div>
                <div className="mt-4 text-center">
                    <div className="inline-flex items-center gap-2 bg-slate-900/50 px-3 py-1 rounded-full border border-slate-700/50">
                         <div className={`h-2.5 w-2.5 rounded-full ${image.status === 'ready' ? 'bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.5)]' : image.status === 'error' ? 'bg-red-400' : 'bg-cyan-400 animate-pulse'}`}></div>
                         <p className="font-black text-slate-300 text-[10px] uppercase tracking-[0.15em]">{image.statusText}</p>
                    </div>
                    {image.status === 'error' && <p className="text-red-400 text-[10px] mt-2 font-mono bg-red-950/20 p-2 rounded-lg border border-red-900/30">{image.error}</p>}
                </div>
                <div className="mt-4 bg-slate-900/80 p-4 rounded-2xl border border-slate-700/50">
                    <div className="flex items-center gap-2 mb-2">
                        <svg className="h-3.5 w-3.5 text-cyan-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /></svg>
                        <span className="text-[10px] font-black text-cyan-400 uppercase tracking-widest">{image.appliedLocation.name || 'Geo Location'}</span>
                    </div>
                    <div className="space-y-1 text-[10px] text-slate-500 font-mono">
                        <div className="flex justify-between"><span>LATITUDE</span> <span className="text-slate-300">{image.appliedLocation.lat.toFixed(6)}</span></div>
                        <div className="flex justify-between"><span>LONGITUDE</span> <span className="text-slate-300">{image.appliedLocation.lng.toFixed(6)}</span></div>
                    </div>
                </div>
            </div>
            <div className="flex-grow w-full md:w-2/3 space-y-4">
                {image.metadata && (
                    <div className="grid grid-cols-1 gap-4">
                        <EditableField label="SEO Filename" value={image.metadata.name} onChange={(val) => handleFieldChange('name', val)} />
                        <EditableField label="Alt Description (WCAG)" value={image.metadata.altText} onChange={(val) => handleFieldChange('altText', val)} />
                        <EditableField label="Marketing Caption" type="textarea" value={image.metadata.caption} onChange={(val) => handleFieldChange('caption', val)} />
                        <EditableField label="Technical Description" type="textarea" value={image.metadata.description} onChange={(val) => handleFieldChange('description', val)} />
                        <EditableField label="Keywords / Tags" value={image.metadata.tags.join(', ')} onChange={(val) => handleFieldChange('tags', val.split(',').map(t => t.trim()))} />
                    </div>
                )}

                <div className="flex flex-col gap-2 pt-4 border-t border-slate-700/50">
                    {image.status === 'ready' && (
                        <button onClick={() => onDownload(image.id)} disabled={isDownloading === image.id}
                                className="w-full bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 text-white font-black py-3 px-4 rounded-xl transition-all text-xs uppercase tracking-widest shadow-xl shadow-cyan-900/20 active:scale-[0.98]">
                            {isDownloading === image.id ? 'Optimizing Jpeg...' : 'Download SEO Master'}
                        </button>
                    )}
                    
                    {(image.status === 'error' || (showRetry && image.status === 'ready')) && onRetry && (
                        <button onClick={onRetry} disabled={isRetrying} className="w-full bg-slate-700 hover:bg-slate-600 text-slate-300 font-black py-2 px-4 rounded-xl transition-all text-[10px] uppercase tracking-widest border border-slate-600 active:scale-95">
                            {isRetrying ? 'Processing Retry...' : (image.status === 'ready' ? 'Regenerate Composition' : 'Retry Image Analysis')}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

const EditableField: React.FC<{ label: string, value: string, onChange: (value: string) => void, type?: 'text' | 'textarea' }> = ({ label, value, onChange, type = 'text' }) => {
    const InputComponent = type === 'textarea' ? 'textarea' : 'input';
    return (
        <div>
            <label className="block text-[9px] font-black uppercase tracking-[0.2em] text-slate-500 mb-1.5">{label}</label>
            <InputComponent
                type="text"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="block w-full bg-slate-900/50 border border-slate-700 rounded-xl shadow-inner py-2 px-4 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500/50 text-sm text-slate-200 transition-all placeholder-slate-700"
                rows={type === 'textarea' ? 2 : undefined}
            />
        </div>
    );
};

const ToggleSwitch: React.FC<{ label: string, description: string, checked: boolean, onChange: (val: boolean) => void }> = ({ label, description, checked, onChange }) => (
    <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-700/20 border border-slate-700 hover:border-slate-600 transition-colors">
        <div className="flex flex-col pr-4">
            <span className="text-[10px] font-black text-slate-200 uppercase tracking-widest">{label}</span>
            <span className="text-[9px] text-slate-500 leading-tight mt-0.5">{description}</span>
        </div>
        <button
            onClick={() => onChange(!checked)}
            className={`${checked ? 'bg-cyan-600' : 'bg-slate-700'} relative inline-flex h-5 w-10 items-center rounded-full transition-colors focus:outline-none shadow-inner`}
        >
            <span className={`${checked ? 'translate-x-6' : 'translate-x-1'} inline-block h-3 w-3 transform rounded-full bg-white transition-transform shadow-md`} />
        </button>
    </div>
);


// --- Main App Component ---

const App: React.FC = () => {
    const [apiKeyIsSet, setApiKeyIsSet] = useState<boolean | null>(null);
    const [mode, setMode] = useState<AppMode>('tagger');

    // --- Global State ---
    const [businessName, setBusinessName] = useState<string>('Citywide Melbourne Appliance Repairs');
    const [options, setOptions] = useState<ProcessingOptions>({
        generateMetadata: true,
        enhanceImage: true,
        embedExif: true,
        randomizeLocation: false
    });
    const [currentLocation, setCurrentLocation] = useState<GeoLocation>(PRESET_LOCATIONS[0]);
    const [isFetchingLocation, setIsFetchingLocation] = useState(false);

    // --- Tagger State ---
    const [processedImages, setProcessedImages] = useState<ProcessedImage[]>([]);
    const [localDragActive, setLocalDragActive] = useState<boolean>(false);
    const [globalDragActive, setGlobalDragActive] = useState<boolean>(false);
    const [isDownloading, setIsDownloading] = useState<string | null>(null);

    // --- Tech Adder State ---
    const [techAdderBaseImage, setTechAdderBaseImage] = useState<File | null>(null);
    const [techAdderTechImage, setTechAdderTechImage] = useState<File | null>(null);
    const [techAdderPreview1, setTechAdderPreview1] = useState<string | null>(null);
    const [techAdderPreview2, setTechAdderPreview2] = useState<string | null>(null);
    const [techAdderResult, setTechAdderResult] = useState<ProcessedImage | null>(null);
    const [isAddingTech, setIsAddingTech] = useState<boolean>(false);

    // --- Composer State ---
    const [composerImages, setComposerImages] = useState<File[]>([]);
    const [composerPreviews, setComposerPreviews] = useState<string[]>([]);
    const [composerResult, setComposerResult] = useState<ProcessedImage | null>(null);
    const [isComposing, setIsComposing] = useState<boolean>(false);

    useEffect(() => {
        const checkKey = async () => {
            // @ts-ignore
            const hasKey = await window.aistudio.hasSelectedApiKey();
            setApiKeyIsSet(hasKey);
        };
        checkKey();
    }, []);

    const handleSelectKey = async () => {
        // @ts-ignore
        await window.aistudio.openSelectKey();
        setApiKeyIsSet(true); // Assume success per instructions
    };

    const fetchBrowserLocation = () => {
        setIsFetchingLocation(true);
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const newLoc = { lat: pos.coords.latitude, lng: pos.coords.longitude, name: 'Browser GPS' };
                setCurrentLocation(newLoc);
                setIsFetchingLocation(false);
            },
            (err) => {
                console.error("Geolocation failed:", err);
                setIsFetchingLocation(false);
                alert("Could not get your location. Please check your browser permissions.");
            }
        );
    };

    const handleAddFiles = useCallback(async (files: File[]) => {
        const convertedFiles = await Promise.all(files.map(file => handleFileConversion(file)));
        const newImages: ProcessedImage[] = [];

        for (const file of convertedFiles) {
            const locationToUse = options.randomizeLocation
                ? PRESET_LOCATIONS[Math.floor(Math.random() * PRESET_LOCATIONS.length)]
                : { ...currentLocation };

            try {
                // No validation - accept all image sizes
                newImages.push({
                    id: `${file.name}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    file,
                    previewUrl: URL.createObjectURL(file),
                    status: 'pending',
                    statusText: 'Waiting...',
                    metadata: null,
                    enhancedImage: null,
                    finalImageBlob: null,
                    error: null,
                    appliedOptions: { ...options },
                    appliedLocation: locationToUse
                });
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : "Image validation failed.";
                newImages.push({
                    id: `${file.name}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    file,
                    previewUrl: URL.createObjectURL(file),
                    status: 'error',
                    statusText: 'Validation Error',
                    metadata: null,
                    enhancedImage: null,
                    finalImageBlob: null,
                    error: errorMessage,
                    appliedOptions: { ...options },
                    appliedLocation: locationToUse
                });
            }
        }
        setProcessedImages(prev => [...prev, ...newImages]);
    }, [options, currentLocation]);

    const processSingleImage = useCallback(async (id: string) => {
        const imageIndex = processedImages.findIndex(img => img.id === id);
        if (imageIndex === -1 || (processedImages[imageIndex].status !== 'pending' && processedImages[imageIndex].status !== 'error')) return;

        const currentImage = processedImages[imageIndex];
        const imageFile = currentImage.file;
        const currentOptions = currentImage.appliedOptions;
        const locationToEmbed = currentImage.appliedLocation;
        
        try {
            let activeMetadata: Metadata | null = null;
            let currentBlob: Blob = imageFile;
            let currentPreviewUrl: string = currentImage.previewUrl;

            // Step 1: Generate Metadata
            if (currentOptions.generateMetadata) {
                setProcessedImages(prev => prev.map(img => img.id === id ? { ...img, status: 'generating', statusText: 'AI Analyzing...' } : img));
                activeMetadata = await generateImageMetadata(imageFile, businessName);
            } else {
                activeMetadata = {
                    name: imageFile.name.replace(/\.[^/.]+$/, ""),
                    description: `Image of ${imageFile.name}`,
                    altText: `Image: ${imageFile.name}`,
                    caption: `Check out our latest work at ${businessName}`,
                    tags: [businessName, 'appliance repair']
                };
            }

            // Step 2: Enhance Image
            if (currentOptions.enhanceImage) {
                setProcessedImages(prev => prev.map(img => img.id === id ? { ...img, metadata: activeMetadata, status: 'enhancing', statusText: 'AI Enhancing...' } : img));
                const { base64: enhancedImageBase64, mimeType: enhancedMimeType } = await enhanceImage(imageFile);
                currentPreviewUrl = `data:${enhancedMimeType};base64,${enhancedImageBase64}`;
                currentBlob = await (await fetch(currentPreviewUrl)).blob();
            }

            // Step 3: Embed Metadata & GPS
            if (currentOptions.embedExif && activeMetadata) {
                setProcessedImages(prev => prev.map(img => img.id === id ? { ...img, enhancedImage: currentOptions.enhanceImage ? currentPreviewUrl : null, metadata: activeMetadata, status: 'embedding', statusText: 'Geo Tagger...' } : img));
                currentBlob = await embedMetadata(currentBlob, activeMetadata, businessName, locationToEmbed);
            }

            setProcessedImages(prev => prev.map(img => img.id === id ? { 
                ...img, 
                metadata: activeMetadata,
                enhancedImage: currentOptions.enhanceImage ? currentPreviewUrl : null,
                finalImageBlob: currentBlob, 
                status: 'ready', 
                statusText: 'SEO Ready' 
            } : img));
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : "An unknown error occurred.";
            setProcessedImages(prev => prev.map(img => img.id === id ? { ...img, status: 'error', statusText: 'Error', error: errorMessage } : img));
        }
    }, [processedImages, businessName]);


    useEffect(() => {
        const isAnyImageProcessing = processedImages.some(img => ['generating', 'enhancing', 'embedding'].includes(img.status));
        if (!isAnyImageProcessing) {
            const nextImageToProcess = processedImages.find(img => img.status === 'pending');
            if (nextImageToProcess) processSingleImage(nextImageToProcess.id);
        }
    }, [processedImages, processSingleImage]);
    
    useEffect(() => {
        const handleDragEnter = (e: DragEvent) => { if (e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')) setGlobalDragActive(true); };
        const handleDragLeave = (e: DragEvent) => { if (!e.relatedTarget) setGlobalDragActive(false); };
        const handleDrop = (e: DragEvent) => {
            e.preventDefault();
            setGlobalDragActive(false);
            if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
                if (!(e.target instanceof HTMLElement && e.target.closest('.uploader-container'))) {
                    handleAddFiles(Array.from(e.dataTransfer.files).slice(0, 20));
                }
            }
        };

        window.addEventListener('dragover', (e) => e.preventDefault());
        window.addEventListener('dragenter', handleDragEnter);
        window.addEventListener('dragleave', handleDragLeave);
        window.addEventListener('drop', handleDrop);
        return () => {
            window.removeEventListener('dragenter', handleDragEnter);
            window.removeEventListener('dragleave', handleDragLeave);
            window.removeEventListener('drop', handleDrop);
        };
    }, [handleAddFiles]);


    const handleMetadataChange = (id: string, newMetadata: Metadata) => {
        setProcessedImages(prev => prev.map(img => img.id === id ? { ...img, metadata: newMetadata } : img));
    };
    
    const handleDownload = useCallback(async (id: string) => {
        const image = processedImages.find(img => img.id === id);
        if (!image || !image.metadata) return;
        setIsDownloading(id);
        try {
            const blobToProcess = image.finalImageBlob || (image.enhancedImage ? await (await fetch(image.enhancedImage)).blob() : image.file);
            const finalBlob = await embedMetadata(blobToProcess, image.metadata, businessName, image.appliedLocation);
            const url = URL.createObjectURL(finalBlob);
            const a = document.createElement('a');
            a.href = url;
            const cleanFilename = slugify(image.metadata.name) || 'seo-image';
            a.download = `${cleanFilename}.jpeg`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (e) { console.error(e); } finally { setIsDownloading(null); }
    }, [processedImages, businessName]);
    
    const handleDownloadAll = useCallback(async () => {
        setIsDownloading('all');
        const zip = new JSZip();
        try {
            const readyImages = processedImages.filter(img => img.status === 'ready');
            for (const image of readyImages) {
                if (image.metadata) {
                    const blobToProcess = image.finalImageBlob || (image.enhancedImage ? await (await fetch(image.enhancedImage)).blob() : image.file);
                    const finalBlob = await embedMetadata(blobToProcess, image.metadata, businessName, image.appliedLocation);
                    const cleanFilename = slugify(image.metadata.name) || `image-${image.id}`;
                    zip.file(`${cleanFilename}.jpeg`, finalBlob);
                }
            }
            const content = await zip.generateAsync({ type: 'blob' });
            const url = URL.createObjectURL(content);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'geo_tagged_seo_assets.zip';
            a.click();
            URL.revokeObjectURL(url);
        } catch (e) { console.error(e); } finally { setIsDownloading(null); }
    }, [processedImages, businessName]);

    const TechAdderUploader: React.FC<{onFile: (f: File) => void, preview: string | null, title: string}> = ({onFile, preview, title}) => {
        const ref = useRef<HTMLInputElement>(null);
        return (
            <div className="flex-1">
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 text-center mb-3">{title}</h3>
                <div onClick={() => ref.current?.click()} className="relative border-2 border-dashed border-slate-700 rounded-3xl h-48 flex flex-col items-center justify-center cursor-pointer hover:border-cyan-400/50 hover:bg-slate-800/30 overflow-hidden group transition-all">
                    <input type="file" accept="image/*,.heic,.heif" ref={ref} className="hidden" onChange={e => {
                        if (e.target.files && e.target.files[0]) onFile(e.target.files[0]);
                    }} />
                    {preview ? <img src={preview} alt={title} className="max-h-full max-w-full rounded-2xl object-contain shadow-2xl transition-transform group-hover:scale-105" /> : (
                        <div className="text-center p-4">
                            <svg className="h-10 w-10 text-slate-700 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                            <p className="text-[9px] text-slate-600 uppercase tracking-widest font-black">Select Image</p>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    const handleTechAdderFileChange = async (file: File | null, imageNumber: 1 | 2) => {
        if (!file) return;
        try {
            // No validation - accept all image sizes
            const convertedFile = await handleFileConversion(file);
            const preview = URL.createObjectURL(convertedFile);
            if (imageNumber === 1) {
                setTechAdderBaseImage(convertedFile);
                setTechAdderPreview1(preview);
            } else {
                setTechAdderTechImage(convertedFile);
                setTechAdderPreview2(preview);
            }
            setTechAdderResult(null);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Image validation failed.";
            setTechAdderResult({
                id: `tech-adder-error-${Date.now()}`,
                file,
                previewUrl: URL.createObjectURL(file),
                status: 'error',
                statusText: 'Validation Error',
                metadata: null,
                enhancedImage: null,
                finalImageBlob: null,
                error: errorMessage,
                appliedOptions: options,
                appliedLocation: currentLocation // Or a dummy location if not applicable
            });
        }
    };

    const handleComposerFileChange = async (files: File[] | null) => {
        if (!files) return;
        const validatedFiles: File[] = [];
        const validatedPreviews: string[] = [];

        for (const file of files) {
            try {
                // No validation - accept all image sizes
                const convertedFile = await handleFileConversion(file);
                validatedFiles.push(convertedFile);
                validatedPreviews.push(URL.createObjectURL(convertedFile));
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : "Image validation failed.";
                alert(`Could not add image '${file.name}': ${errorMessage}`);
            }
        }
        setComposerImages(prev => [...prev, ...validatedFiles]);
        setComposerPreviews(prev => [...prev, ...validatedPreviews]);
        setComposerResult(null);
    };

    const handleAddTechAndProcess = async () => {
        if (!techAdderBaseImage || !techAdderTechImage) return;
        
        const id = techAdderResult?.id || `gen-${Date.now()}`;
        setIsAddingTech(true);
        
        // Initialize state early so user sees "Processing..." feedback
        setTechAdderResult({ 
            id, 
            file: techAdderBaseImage, 
            previewUrl: techAdderPreview1 || '', 
            status: 'generating', 
            statusText: 'AI Synthesizing...', 
            metadata: null, 
            enhancedImage: null, 
            finalImageBlob: null, 
            error: null, 
            appliedOptions: options, 
            appliedLocation: currentLocation 
        });

        try {
            // No validation - accept all image sizes
            
            // Automatically upscale the tech image to a standard height for better quality
            const upscaledTechBlob = await upscaleImageToHeight(techAdderTechImage, 1024);
            const upscaledTechFile = new File([upscaledTechBlob], techAdderTechImage.name, { type: upscaledTechBlob.type });

            const { base64, mimeType } = await addTechToImage(techAdderBaseImage, upscaledTechFile);
            const blob = await (await fetch(`data:${mimeType};base64,${base64}`)).blob();
            const file = new File([blob], 'composite_scene.png', { type: mimeType });
            
            const locationToUse = options.randomizeLocation 
                ? PRESET_LOCATIONS[Math.floor(Math.random() * PRESET_LOCATIONS.length)]
                : { ...currentLocation };

            setTechAdderResult(prev => ({ 
                ...prev!,
                file, 
                previewUrl: URL.createObjectURL(file), 
                status: 'generating', 
                statusText: 'Metadata Gen...', 
                enhancedImage: `data:${mimeType};base64,${base64}`, 
                appliedLocation: locationToUse 
            }));
            
            const metadata = await generateImageMetadata(file, businessName);
            setTechAdderResult(prev => prev ? { ...prev, metadata, status: 'ready', statusText: 'Synthesized', finalImageBlob: blob } : null);
        } catch (err) { 
            const errorMessage = err instanceof Error ? err.message : "An unknown error occurred.";
            setTechAdderResult(prev => {
                const base = prev || {
                    id,
                    file: techAdderBaseImage,
                    previewUrl: techAdderPreview1 || '',
                    metadata: null,
                    enhancedImage: null,
                    finalImageBlob: null,
                    appliedOptions: options,
                    appliedLocation: currentLocation
                };
                return { ...base, status: 'error', statusText: 'Error', error: errorMessage };
            });
        } finally { 
            setIsAddingTech(false); 
        }
    };

    const handleComposeAndProcess = async (layoutPrompt: string, aspectRatio: number) => {
        if (composerImages.length === 0) return;
        
        const id = composerResult?.id || `composed-${Date.now()}`;
        setIsComposing(true);

        setComposerResult({ 
            id, 
            file: composerImages[0], 
            previewUrl: composerPreviews[0], 
            status: 'generating', 
            statusText: 'AI Composing...', 
            metadata: null, 
            enhancedImage: null, 
            finalImageBlob: null, 
            error: null, 
            appliedOptions: options, 
            appliedLocation: currentLocation 
        });

        try {
            let blob: Blob;
            let mimeType: string;
            let base64: string;

            if (composerImages.length === 1) {
                // If only one image, don't call AI, just use it directly
                blob = composerImages[0];
                mimeType = composerImages[0].type;
                base64 = await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
                    reader.readAsDataURL(blob);
                });
            } else {
                const result = await composeImages(composerImages, layoutPrompt);
                base64 = result.base64;
                mimeType = result.mimeType;
                blob = await (await fetch(`data:${mimeType};base64,${base64}`)).blob();
            }

            let enhancedImageUrl = `data:${mimeType};base64,${base64}`;
            let fileType = mimeType;
            let fileName = 'composed_image.png';

            if (aspectRatio > 0) {
                blob = await resizeImage(blob, aspectRatio);
                enhancedImageUrl = await convertBlobToJpegDataURL(blob);
                fileType = 'image/jpeg';
                fileName = 'composed_image.jpeg';
            }

            // No validation - accept all image sizes
            const file = new File([blob], fileName, { type: fileType });
            
            const locationToUse = options.randomizeLocation 
                ? PRESET_LOCATIONS[Math.floor(Math.random() * PRESET_LOCATIONS.length)]
                : { ...currentLocation };

            setComposerResult(prev => ({ 
                ...prev!,
                file, 
                previewUrl: URL.createObjectURL(file), 
                status: 'generating', 
                statusText: 'Metadata Gen...', 
                enhancedImage: enhancedImageUrl, 
                appliedLocation: locationToUse 
            }));
            
            const metadata = await generateImageMetadata(file, businessName);
            setComposerResult(prev => prev ? { ...prev, metadata, status: 'ready', statusText: 'Composed', finalImageBlob: blob } : null);
        } catch (err) { 
            const errorMessage = err instanceof Error ? err.message : "An unknown error occurred.";
            setComposerResult(prev => {
                const base = prev || {
                    id,
                    file: composerImages[0],
                    previewUrl: composerPreviews[0],
                    metadata: null,
                    enhancedImage: null,
                    finalImageBlob: null,
                    appliedOptions: options,
                    appliedLocation: currentLocation
                };
                return { ...base, status: 'error', statusText: 'Error', error: errorMessage };
            });
        } finally { 
            setIsComposing(false); 
        }
    };

    const handleTechAdderDownload = async () => {
        if (!techAdderResult || !techAdderResult.metadata) return;
        setIsDownloading(techAdderResult.id);
        try {
            const blob = techAdderResult.finalImageBlob || (techAdderResult.enhancedImage ? await (await fetch(techAdderResult.enhancedImage)).blob() : techAdderResult.file);
            const final = await embedMetadata(blob, techAdderResult.metadata, businessName, techAdderResult.appliedLocation);
            const url = URL.createObjectURL(final);
            const a = document.createElement('a'); 
            a.href = url;
            const cleanFilename = slugify(techAdderResult.metadata.name) || 'composite-seo';
            a.download = `${cleanFilename}.jpeg`;
            a.click();
            URL.revokeObjectURL(url);
        } finally { 
            setIsDownloading(null); 
        }
    };

    const handleComposerDownload = async () => {
        if (!composerResult || !composerResult.metadata) return;
        setIsDownloading(composerResult.id);
        try {
            const blob = composerResult.finalImageBlob || (composerResult.enhancedImage ? await (await fetch(composerResult.enhancedImage)).blob() : composerResult.file);
            const final = await embedMetadata(blob, composerResult.metadata, businessName, composerResult.appliedLocation);
            const url = URL.createObjectURL(final);
            const a = document.createElement('a');
            a.href = url;
            const cleanFilename = slugify(composerResult.metadata.name) || 'composed-seo';
            a.download = `${cleanFilename}.jpeg`;
            a.click();
            URL.revokeObjectURL(url);
        } finally {
            setIsDownloading(null);
        }
    };

    if (apiKeyIsSet === false) return <ApiKeyOverlay onSelectKey={handleSelectKey} />;
    if (apiKeyIsSet === null) return null;

    return (
        <div className="app-root selection:bg-cyan-500/30">
            {globalDragActive && <DragOverlay />}
            <div className="min-h-screen bg-slate-900 text-white p-4 sm:p-8 lg:p-12 font-sans relative overflow-x-hidden">
                <div className="max-w-5xl mx-auto">
                    <header className="text-center mb-16 relative">
                        <div className="inline-flex items-center gap-2 bg-cyan-900/30 text-cyan-400 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-[0.25em] border border-cyan-800/40 mb-6 backdrop-blur-sm">
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
                            </span>
                            Asset Intelligence 3.0
                        </div>
                        <h1 className="text-7xl font-black text-white tracking-tighter uppercase italic leading-[0.85] mb-2">
                            Asset <span className="text-cyan-500 text-transparent bg-clip-text bg-gradient-to-br from-cyan-400 to-cyan-700">Master</span>
                        </h1>
                        <p className="text-slate-500 mt-2 text-sm font-black uppercase tracking-[0.4em]">Geo-Targeted Bulk SEO Tagger</p>
                    </header>

                    <div className="bg-slate-800/40 backdrop-blur-xl rounded-[2.5rem] p-1.5 mb-10 border border-slate-700/50 flex shadow-2xl">
                        <button onClick={() => setMode('tagger')} className={`flex-1 py-4 px-6 rounded-[2rem] font-black transition-all text-xs uppercase tracking-[0.2em] flex items-center justify-center gap-3 ${mode === 'tagger' ? 'bg-cyan-600 text-white shadow-xl shadow-cyan-900/40' : 'text-slate-500 hover:text-slate-300'}`}>
                             <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>
                             Bulk SEO Tagger
                        </button>
                        <button onClick={() => setMode('techAdder')} className={`flex-1 py-4 px-6 rounded-[2rem] font-black transition-all text-xs uppercase tracking-[0.2em] flex items-center justify-center gap-3 ${mode === 'techAdder' ? 'bg-cyan-600 text-white shadow-xl shadow-cyan-900/40' : 'text-slate-500 hover:text-slate-300'}`}>
                             <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
                             Tech Synthesis
                        </button>
                        <button onClick={() => setMode('composer')} className={`flex-1 py-4 px-6 rounded-[2rem] font-black transition-all text-xs uppercase tracking-[0.2em] flex items-center justify-center gap-3 ${mode === 'composer' ? 'bg-cyan-600 text-white shadow-xl shadow-cyan-900/40' : 'text-slate-500 hover:text-slate-300'}`}>
                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 6a2 2 0 012-2h12a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V6z" /></svg>
                            Image Composer
                        </button>
                    </div>

                    <main className="bg-slate-800/20 rounded-[3rem] p-8 sm:p-10 border border-slate-800 shadow-[0_0_100px_rgba(0,0,0,0.5)] relative overflow-hidden backdrop-blur-md">
                        <div className="absolute -top-24 -left-24 w-96 h-96 bg-cyan-600/5 blur-[120px] pointer-events-none"></div>
                        <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-cyan-600/5 blur-[120px] pointer-events-none"></div>
                        
                        {/* Global Controls - Shared across all modes */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                            <div className="bg-slate-800/60 p-5 rounded-3xl border border-slate-700/50 shadow-sm relative z-10">
                                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-400 mb-4 flex items-center gap-2">
                                     <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                                     Branding
                                </h3>
                                <div className="space-y-1">
                                    <label className="text-[9px] text-slate-500 uppercase font-black tracking-widest ml-1">Company Entity</label>
                                    <input type="text" value={businessName} onChange={(e) => setBusinessName(e.target.value)}
                                        className="block w-full bg-slate-900/50 border border-slate-700 rounded-2xl py-2.5 px-4 focus:ring-2 focus:ring-cyan-500/20 text-sm text-white transition-all shadow-inner"
                                        placeholder="Enter business name..." />
                                </div>
                            </div>
                            
                            <div className="bg-slate-800/60 p-5 rounded-3xl border border-slate-700/50 shadow-sm relative z-10">
                                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-400 mb-4 flex items-center gap-2">
                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                    GEO Hub
                                </h3>
                                <div className="space-y-3">
                                    <div className="flex gap-2">
                                        <select className="flex-grow bg-slate-900/50 border border-slate-700 rounded-xl py-2 px-3 text-[11px] text-white focus:outline-none appearance-none cursor-pointer"
                                            value={currentLocation.name}
                                            disabled={options.randomizeLocation}
                                            onChange={(e) => {
                                                const loc = PRESET_LOCATIONS.find(l => l.name === e.target.value);
                                                if (loc) setCurrentLocation(loc);
                                            }}>
                                            {PRESET_LOCATIONS.map(l => <option key={l.name} value={l.name}>{l.name}</option>)}
                                        </select>
                                        <button onClick={fetchBrowserLocation} disabled={isFetchingLocation || options.randomizeLocation}
                                            className="bg-cyan-600 hover:bg-cyan-500 p-2.5 rounded-xl disabled:bg-slate-800 transition-all shadow-lg active:scale-95" title="Fetch Live GPS">
                                            <svg className={`h-4 w-4 ${isFetchingLocation ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /></svg>
                                        </button>
                                    </div>
                                    <div className={`flex gap-2 transition-opacity ${options.randomizeLocation ? 'opacity-30 pointer-events-none' : 'opacity-100'}`}>
                                        <div className="relative w-1/2">
                                            <input type="number" step="0.000001" value={currentLocation.lat} onChange={e => setCurrentLocation({...currentLocation, lat: parseFloat(e.target.value), name: 'Manual'})} className="w-full bg-slate-900/50 border border-slate-700 rounded-xl py-2 px-3 text-[10px] text-slate-300 font-mono" placeholder="LAT" />
                                        </div>
                                        <div className="relative w-1/2">
                                            <input type="number" step="0.000001" value={currentLocation.lng} onChange={e => setCurrentLocation({...currentLocation, lng: parseFloat(e.target.value), name: 'Manual'})} className="w-full bg-slate-900/50 border border-slate-700 rounded-xl py-2 px-3 text-[10px] text-slate-300 font-mono" placeholder="LNG" />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-slate-800/60 p-5 rounded-3xl border border-slate-700/50 shadow-sm relative z-10">
                                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-400 mb-4 flex items-center gap-2">
                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 6V4m0 2a2 2 0 100 4" /></svg>
                                    Engines
                                </h3>
                                <div className="space-y-2">
                                    <ToggleSwitch label="AI Meta" description="SEO-tuned data" checked={options.generateMetadata} onChange={(val) => setOptions(prev => ({ ...prev, generateMetadata: val }))} />
                                    <ToggleSwitch label="Auto-GPS" description="Bulk shuffle" checked={options.randomizeLocation} onChange={(val) => setOptions(prev => ({ ...prev, randomizeLocation: val }))} />
                                </div>
                            </div>
                        </div>

                        {mode === 'tagger' ? (
                            <div className="tagger-view animate-in fade-in duration-500">
                                <div className="uploader-container mb-8">
                                    <Uploader onFilesAdded={handleAddFiles} dragActive={localDragActive} setDragActive={setLocalDragActive} setGlobalDragActive={setGlobalDragActive} />
                                </div>
                                
                                {processedImages.length > 0 && (
                                    <div className="mb-8">
                                        <button onClick={handleDownloadAll} disabled={isDownloading === 'all' || !processedImages.some(img => img.status === 'ready')}
                                                className="w-full bg-slate-800 hover:bg-slate-700 disabled:bg-slate-900 text-cyan-400 border border-slate-700 font-black py-4 px-6 rounded-3xl transition-all shadow-2xl flex items-center justify-center gap-3 uppercase tracking-[0.2em] text-xs active:scale-[0.98]">
                                            {isDownloading === 'all' ? (
                                                 <><div className="h-4 w-4 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin"></div> Generating Master Archive...</>
                                            ) : (
                                                <>
                                                 <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                                 Download All Assets (ZIP)
                                                </>
                                            )}
                                        </button>
                                    </div>
                                )}

                                <div className="space-y-6">
                                    {processedImages.map((image) => (
                                        <ImageCard key={image.id} image={image} onMetadataChange={handleMetadataChange} onDownload={handleDownload} isDownloading={isDownloading} onRetry={() => processSingleImage(image.id)}/>
                                    ))}
                                </div>
                            </div>
                        ) : mode === 'composer' ? (
                            <div className="composer-view space-y-8 animate-in fade-in duration-500">
                                <div className="uploader-container">
                                    <Uploader onFilesAdded={handleComposerFileChange} dragActive={localDragActive} setDragActive={setLocalDragActive} setGlobalDragActive={setGlobalDragActive} />
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <input type="text" id="layout-prompt" placeholder="E.g., 'A 2x2 grid of the images'" className="w-full bg-slate-900/50 border border-slate-700 rounded-2xl py-2.5 px-4 focus:ring-2 focus:ring-cyan-500/20 text-sm text-white transition-all shadow-inner" />
                                    <select id="aspect-ratio" className="w-full bg-slate-900/50 border border-slate-700 rounded-2xl py-2.5 px-4 focus:ring-2 focus:ring-cyan-500/20 text-sm text-white transition-all shadow-inner appearance-none">
                                        <option value="0">Original</option>
                                        <option value="1.7777777778">16:9</option>
                                        <option value="1">1:1 (Square)</option>
                                        <option value="1.91">1.91:1 (Social Media)</option>
                                        <option value="0.8">4:5 (Portrait)</option>
                                    </select>
                                </div>
                                <div className="text-center">
                                    <button onClick={() => {
                                        const prompt = (document.getElementById('layout-prompt') as HTMLInputElement).value;
                                        const ratio = parseFloat((document.getElementById('aspect-ratio') as HTMLSelectElement).value);
                                        handleComposeAndProcess(prompt, ratio);
                                    }} disabled={composerImages.length === 0 || isComposing}
                                        className="w-full max-w-sm bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-800 text-white font-black py-4 px-8 rounded-3xl transition-all shadow-2xl shadow-cyan-900/30 uppercase tracking-[0.2em] text-xs active:scale-95">
                                        {isComposing ? (
                                            <span className="flex items-center justify-center gap-3">
                                                <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                                AI Composing...
                                            </span>
                                        ) : 'Compose Images'}
                                    </button>
                                </div>
                                {composerPreviews.length > 0 && (
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                        {composerPreviews.map((preview, index) => (
                                            <img key={index} src={preview} alt={`preview-${index}`} className="w-full h-auto rounded-lg" />
                                        ))}
                                    </div>
                                )}
                                {composerResult && (
                                    <div className="mt-12 border-t border-slate-700/50 pt-12">
                                        <ImageCard
                                            image={composerResult}
                                            onMetadataChange={(id, meta) => setComposerResult(prev => prev ? { ...prev, metadata: meta } : null)}
                                            onDownload={handleComposerDownload}
                                            isDownloading={isDownloading}
                                            onRetry={() => {
                                                const prompt = (document.getElementById('layout-prompt') as HTMLInputElement).value;
                                                const ratio = parseFloat((document.getElementById('aspect-ratio') as HTMLSelectElement).value);
                                                handleComposeAndProcess(prompt, ratio);
                                            }}
                                            showRetry={true}
                                            isRetrying={isComposing}
                                        />
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="tech-adder-view space-y-8 animate-in fade-in duration-500">
                                <div className="flex flex-col md:flex-row gap-6">
                                    <TechAdderUploader title="Base Scene (Appliance)" preview={techAdderPreview1} onFile={f => handleTechAdderFileChange(f, 1)} />
                                    <TechAdderUploader title="Isolated Technician" preview={techAdderPreview2} onFile={f => handleTechAdderFileChange(f, 2)} />
                                </div>
                                
                                <div className="text-center">
                                    <button onClick={handleAddTechAndProcess} disabled={!techAdderBaseImage || !techAdderTechImage || isAddingTech} 
                                            className="w-full max-w-sm bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-800 text-white font-black py-4 px-8 rounded-3xl transition-all shadow-2xl shadow-cyan-900/30 uppercase tracking-[0.2em] text-xs active:scale-95">
                                        {isAddingTech ? (
                                             <span className="flex items-center justify-center gap-3">
                                                <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                                AI Synthesizing...
                                             </span>
                                        ) : 'Create Composite & Analyze'}
                                    </button>
                                    <p className="mt-4 text-[9px] text-slate-600 uppercase font-black tracking-widest">AI will automatically place technician in a realistic position.</p>
                                </div>

                                {techAdderResult && (
                                    <div className="mt-12 border-t border-slate-700/50 pt-12">
                                        <ImageCard 
                                            image={techAdderResult} 
                                            onMetadataChange={(id, meta) => setTechAdderResult(prev => prev ? {...prev, metadata: meta} : null)} 
                                            onDownload={handleTechAdderDownload} 
                                            isDownloading={isDownloading} 
                                            onRetry={handleAddTechAndProcess}
                                            showRetry={true}
                                            isRetrying={isAddingTech}
                                        />
                                    </div>
                                )}
                            </div>
                        )}
                    </main>

                    <footer className="mt-20 text-center pb-20 border-t border-slate-800 pt-10">
                        <div className="text-slate-600 text-[10px] font-black uppercase tracking-[0.3em] mb-4">
                            Asset Master • © {new Date().getFullYear()} Precision Digital
                        </div>
                        <div className="flex flex-col items-center gap-6">
                            <span className="text-slate-400 font-black tracking-widest italic text-sm">Developed by Anoop Kumar Khushwaha</span>
                            <div className="flex gap-4">
                                <a href="https://www.linkedin.com/in/anoop-kumar-khushwaha-b16b64218/" target="_blank" rel="noopener noreferrer" className="p-3 bg-slate-800/50 rounded-2xl hover:bg-cyan-600/20 hover:text-cyan-400 transition-all text-slate-500 shadow-xl border border-slate-700/50" title="LinkedIn Profile">
                                    <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24"><path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.238 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/></svg>
                                </a>
                                <a href="https://github.com/a1819644" target="_blank" rel="noopener noreferrer" className="p-3 bg-slate-800/50 rounded-2xl hover:bg-cyan-600/20 hover:text-cyan-400 transition-all text-slate-500 shadow-xl border border-slate-700/50" title="GitHub Portfolio">
                                    <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.041-1.416-4.041-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
                                </a>
                            </div>
                        </div>
                    </footer>
                </div>
            </div>
        </div>
    );
};

export default App;
