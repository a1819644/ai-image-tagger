
import { GoogleGenAI, Type, Modality } from "@google/genai";
import type { Metadata } from '../types';

const getGenAIClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API_KEY environment variable not set.");
  }
  // The SDK doesn't easily support baseUrl in this version without private hacks
  // We will use a custom helper for the API calls that need the proxy.
  return new GoogleGenAI({ apiKey });
};

// Helper for calling Gemini API via proxy to avoid CORS
const callGeminiApi = async (model: string, contents: any, config: any = {}) => {
  const apiKey = process.env.API_KEY;
  // In local development, we use the proxy defined in vite.config.ts
  const baseUrl = '/api-proxy';
  const url = `${baseUrl}/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents,
      generationConfig: config
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'API request failed');
  }

  return await response.json();
};

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      // remove the "data:image/jpeg;base64," part
      const base64String = result.split(',')[1];
      resolve(base64String);
    };
    reader.onerror = (error) => reject(error);
  });


export const generateImageMetadata = async (file: File, businessName: string): Promise<Metadata> => {
  try {
    const base64Image = await fileToBase64(file);

    const data = await callGeminiApi("gemini-2.5-flash", [
      {
        parts: [
          {
            text: `You are an expert SEO and digital marketing assistant for an appliance repair business named "${businessName}". Analyze the provided image and generate the following distinct metadata components. Each component must be tailored for its specific purpose.

**Important Rule for Appliance Type:** When identifying the appliance, use a generic but descriptive name (e.g., "display refrigerator," "commercial freezer," "stacked laundry machine"). Avoid being overly specific about what the appliance might contain (e.g., prefer "display refrigerator" over "wine cooler"). Apply this rule to all generated fields below.

1.  **SEO Filename (name)**: Create a concise, SEO-friendly filename (without the file extension). The name must follow one of two formats:
    - If the brand is visible: \`[brand-name]-[appliance-type]-[full-business-name-slug]\`.
    - If the brand is NOT visible: \`[appliance-type]-[full-business-name-slug]\`.
    - For \`[brand-name]\`, use the brand ONLY if clearly visible in the image.
    - For \`[appliance-type]\`, use the generic appliance type as described in the rule above.
    - For \`[full-business-name-slug]\`, convert the full business name "${businessName}" into a lowercase, hyphenated slug (e.g., "Citywide Melbourne Appliance Repairs" becomes "citywide-melbourne-appliance-repairs").
    - Example with brand: \`samsung-fridge-citywide-melbourne-appliance-repairs\`.
    - Example without brand: \`display-refrigerator-citywide-melbourne-appliance-repairs\`.
    - Do NOT include generic words like "repair" or "service" in the filename, unless it's part of the business name slug.

2.  **Alt Text (altText)**: Write a concise, literal description of the image for accessibility (WCAG compliant). Describe exactly what is visible for visually impaired users. Avoid marketing language. Example: "A technician in a blue uniform inspecting the interior of a stainless steel display refrigerator."

3.  **SEO Description (description)**: Write a detailed, one-to-two sentence description optimized for search engines. This text will appear on the website near the image. It should naturally incorporate keywords like "appliance repair," "commercial," and "domestic" services, along with what's depicted in the image.

4.  **Social Media Caption (caption)**: Create an engaging and friendly caption for social media platforms like Instagram or Facebook. It can include a question to encourage engagement or a brief customer-centric tip. Example: "Is your display fridge not keeping its cool? Our expert technicians can diagnose and fix it fast! #ApplianceRepair #${businessName}".

5.  **Tags (tags)**: Provide a list of 5-10 relevant SEO keywords as a JSON array of strings. This list MUST include "${businessName}", "commercial appliance repair", and "domestic appliance repair". Other tags should be specific to the appliance or service shown.`
          },
          { inlineData: { mimeType: file.type, data: base64Image } }
        ]
      }
    ], {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          description: { type: Type.STRING },
          altText: { type: Type.STRING },
          caption: { type: Type.STRING },
          tags: { type: Type.ARRAY, items: { type: Type.STRING } }
        },
        required: ["name", "description", "altText", "caption", "tags"]
      }
    });

    if (!data.candidates?.[0]) {
      throw new Error("No candidates returned from API. Check your request or API quota.");
    }

    const candidate = data.candidates[0];
    if (candidate.finishReason === 'SAFETY') {
      throw new Error("Content was blocked by safety filters. Try a different image or description.");
    }

    if (!candidate.content?.parts?.[0]?.text) {
      throw new Error(`API returned an unexpected response structure. Reason: ${candidate.finishReason || 'Unknown'}`);
    }

    const parsedMetadata: Metadata = JSON.parse(candidate.content.parts[0].text);

    // Ensure required tags are present and handle potential case variations from the model.
    const requiredTags = [
      { key: businessName.toLowerCase(), value: businessName },
      { key: 'commercial appliance repair', value: 'commercial appliance repair' },
      { key: 'domestic appliance repair', value: 'domestic appliance repair' },
    ];

    const tagMap = new Map(parsedMetadata.tags.map(tag => [tag.toLowerCase(), tag]));

    requiredTags.forEach(req => {
      if (!tagMap.has(req.key)) {
        tagMap.set(req.key, req.value);
      }
    });

    parsedMetadata.tags = Array.from(tagMap.values());

    return parsedMetadata;

  } catch (error) {
    console.error("Error generating image metadata:", error);
    if (error instanceof Error) {
      throw new Error(`Failed to generate metadata: ${error.message}`);
    }
    throw new Error("An unknown error occurred while generating metadata.");
  }
};

export const enhanceImage = async (file: File): Promise<{ base64: string, mimeType: string }> => {
  try {
    const base64Image = await fileToBase64(file);

    const data = await callGeminiApi('gemini-2.5-flash-image', [
      {
        parts: [
          { inlineData: { data: base64Image, mimeType: file.type } },
          { text: 'Enhance this image to improve its quality. Make it look cleaner, sharper, and more vibrant without altering the core subject.' }
        ]
      }
    ], {
      responseModalities: [Modality.IMAGE]
    });

    if (!data.candidates?.[0]?.content?.parts) {
      const reason = data.candidates?.[0]?.finishReason;
      if (reason === 'SAFETY') throw new Error("Enhancement blocked by safety filters.");
      throw new Error(`Enhanced image data not found. Reason: ${reason || 'Unknown'}`);
    }

    for (const part of data.candidates[0].content.parts) {
      if (part.inlineData && part.inlineData.mimeType.startsWith('image/')) {
        return { base64: part.inlineData.data, mimeType: part.inlineData.mimeType };
      }
    }

    throw new Error("Enhanced image data not found in API response.");

  } catch (error) {
    console.error("Error enhancing image:", error);
    if (error instanceof Error) {
      throw new Error(`Failed to enhance image: ${error.message}`);
    }
    throw new Error("An unknown error occurred while enhancing the image.");
  }
};

export const addTechToImage = async (baseImageFile: File, techImageFile: File): Promise<{ base64: string, mimeType: string }> => {
  try {
    const baseImageBase64 = await fileToBase64(baseImageFile);
    const techImageBase64 = await fileToBase64(techImageFile);

    const data = await callGeminiApi('gemini-2.5-flash-image', [
      {
        parts: [
          {
            text: `You are an expert photo editor. Extract the person from the SECOND image and add them to the FIRST image.

**Instructions:**
- Keep the background, room, and appliances from the FIRST image exactly as they are
- Extract only the person from the SECOND image
- Position the person naturally next to the appliance
- Make it look realistic by matching lighting, shadows, and colors
- The person should look like they were actually there in the original scene`
          },
          {
            // Background scene
            inlineData: {
              data: baseImageBase64,
              mimeType: baseImageFile.type,
            },
          },
          {
            // Person to extract
            inlineData: {
              data: techImageBase64,
              mimeType: techImageFile.type,
            },
          },
        ],
      }
    ], {
      responseModalities: [Modality.IMAGE]
    });

    if (!data.candidates?.[0]?.content?.parts) {
      const reason = data.candidates?.[0]?.finishReason;
      if (reason === 'SAFETY') throw new Error("Synthesis blocked by safety filters. Ensure images are professional and appropriate.");
      throw new Error(`Generated image data not found. Reason: ${reason || 'Unknown'}`);
    }

    for (const part of data.candidates[0].content.parts) {
      if (part.inlineData && part.inlineData.mimeType.startsWith('image/')) {
        return { base64: part.inlineData.data, mimeType: part.inlineData.mimeType };
      }
    }

    throw new Error("Generated image data not found in API response.");

  } catch (error) {
    console.error("Error adding tech to image:", error);
    if (error instanceof Error) {
      throw new Error(`Failed to add tech to image: ${error.message}`);
    }
    throw new Error("An unknown error occurred while adding tech to the image.");
  }
};

export const composeImages = async (images: File[], layoutPrompt: string): Promise<{ base64: string, mimeType: string }> => {
  try {
    const imageParts = await Promise.all(
      images.map(async (file) => {
        const base64Image = await fileToBase64(file);
        return {
          inlineData: {
            data: base64Image,
            mimeType: file.type,
          },
        };
      })
    );

    const data = await callGeminiApi('gemini-2.5-flash-image', [
      {
        parts: [
          {
            text: `You are an expert graphic designer. Your task is to combine the following images into a single, cohesive composition based on the user's layout request.

Layout Request: "${layoutPrompt}"

**Execution:**
- Arrange the images exactly as requested.
- Ensure the final composition is well-balanced and aesthetically pleasing.
- Maintain the original quality and aspect ratio of each individual image within the composition.
- The output should be a single image file.`,
          },
          ...imageParts,
        ],
      },
    ], {
      responseModalities: [Modality.IMAGE]
    });

    if (!data.candidates?.[0]?.content?.parts) {
      const reason = data.candidates?.[0]?.finishReason;
      if (reason === 'SAFETY') throw new Error("Composition blocked by safety filters.");
      throw new Error(`Generated image data not found. Reason: ${reason || 'Unknown'}`);
    }

    for (const part of data.candidates[0].content.parts) {
      if (part.inlineData && part.inlineData.mimeType.startsWith('image/')) {
        return { base64: part.inlineData.data, mimeType: part.inlineData.mimeType };
      }
    }

    throw new Error("Generated image data not found in API response.");

  } catch (error) {
    console.error("Error composing images:", error);
    if (error instanceof Error) {
      throw new Error(`Failed to compose images: ${error.message}`);
    }
    throw new Error("An unknown error occurred while composing the images.");
  }
};


