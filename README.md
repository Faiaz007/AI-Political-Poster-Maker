# Political Poster Generator

A web platform where users (local political workers, committee members, publicity agents) can generate ready-to-print political posters. The system uses AI to compose and edit poster layouts automatically based on user input (name, designation, party, photo, occasion).

## System Architecture

The application is built using a modern full-stack architecture with a focus on reliable text rendering for regional languages (Bangla).

### 1. Frontend (Next.js)
- **Framework**: Next.js with TypeScript
- **Styling**: Tailwind CSS
- **Features**: Authentication, poster form with file uploads, template selection, and real-time generation status.

### 2. Backend (Node.js & Express)
- **Framework**: Express.js with TypeScript
- **Database**: MongoDB (Mongoose)
- **Auth**: JWT-based authentication
- **Image Storage**: Local storage (can be configured for Cloudinary/S3)
- **AI Integration**: Google Gemini API for intelligent layout planning, color scheme generation, and theme-matching.

### 3. Poster Generation Pipeline
The core generation is handled through a hybrid approach (AI-assisted layout + HTML/Canvas render) to ensure Bangla text is rendered perfectly without AI hallucination or spelling errors:
1. **User Request**: User submits text details (headline, name, etc.) and uploads photos.
2. **AI Layout Planning**: Gemini analyzes the inputs and the selected template to generate a structured JSON layout (colors, photo placements).
3. **HTML Rendering**: The backend uses the AI's layout to generate an HTML document containing the precise user text, CSS layouts, and uploaded photos.
4. **Puppeteer Export**: Puppeteer (headless Chromium) takes a high-resolution screenshot of the rendered HTML, guaranteeing print-ready quality and 100% accurate Bangla typography.

## Deployment Instructions

### Frontend (Vercel)
The frontend is optimized for deployment on Vercel. 
- Set the `NEXT_PUBLIC_API_URL` environment variable to your deployed backend URL.

### Backend (Render / Railway / VPS)
The backend requires a Chromium runtime for Puppeteer. 
- A `Dockerfile` is included in the backend directory. You can easily deploy it using Docker to platforms like Render or Railway.
- Ensure MongoDB is running (e.g., MongoDB Atlas) and provide the `MONGODB_URI`.
- Provide `GEMINI_API_KEY` for AI generation features.
