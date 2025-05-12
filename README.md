# Xena - Fully Autonomous Designer for Ecommerce Stores

Xena is an AI-powered ecommerce creative generation platform that helps businesses create professional product imagery and marketing assets using advanced AI technology.

## Features

- **AI Image Generation**: Transform product photos into professional marketing assets
- **Multi-Variant Generation**: Create multiple design variations in a single request
- **Shopify Integration**: Seamless connection to import product data and images
- **Creative Management**: Organize and categorize your generated images
- **Reference Image Library**: Store and reuse creative inspiration
- **User Management**: Complete authentication with email verification
- **Credits System**: Track usage with a built-in credits system

## Technology Stack

### Frontend
- **React**: UI library for building the component-based interface
- **TypeScript**: Type-safe JavaScript for robust code quality
- **TailwindCSS**: Utility-first CSS framework for styling
- **shadcn/ui**: High-quality UI components built with Radix UI and Tailwind
- **React Router**: Client-side routing and navigation
- **React Hook Form**: Form validation and handling
- **Zod**: TypeScript-first schema validation
- **Recharts**: Composable chart library for statistics and analytics

### Backend
- **Supabase**: Backend-as-a-service platform providing:
  - PostgreSQL database
  - Authentication
  - Storage
  - Edge Functions for serverless processing
  - Row Level Security (RLS)

### AI Image Generation
- **OpenAI API**: Powers the AI image generation with the `gpt-image-1` model
- Custom edge functions for handling image processing and optimization

### Deployment
- **Netlify**: Static hosting and continuous deployment
- **Vite**: Fast and modern frontend build tool and development server

## Architecture

### Database Schema

The application uses a relational database with the following key tables:

1. **images**: Stores generated AI images
2. **assets**: Unified storage for all image assets (library, reference, and generated)
3. **photoshoots**: Stores photoshoot generation tasks and results
4. **generation_tasks**: Tracks image generation processes
5. **user_profiles**: Stores user information and credit balances
6. **shopify_credentials**: Manages Shopify integration data 
7. **shopify_products**: Caches product data from connected stores

### Supabase Integration

The application leverages several Supabase features:

1. **Authentication**: Email/password authentication with verification
2. **Storage**: Multiple storage buckets for different asset types
3. **Edge Functions**:
   - `generate-image`: Main image generation endpoint that interfaces with OpenAI
   - `process-generation-task`: Handles individual image generation tasks
   - `monitor-batch-tasks`: Monitors and restarts stalled generation jobs

### Row Level Security (RLS)

Every table is protected with Row Level Security policies to ensure users can only access their own data. The policies follow these patterns:

- SELECT policies: `auth.uid() = user_id`
- INSERT policies: `auth.uid() = user_id`
- UPDATE policies: `auth.uid() = user_id` 
- DELETE policies: `auth.uid() = user_id`

## Image Generation Process

The application uses a sophisticated image generation process:

1. **Input Collection**: 
   - Product image (required)
   - Reference image (optional)
   - Text prompt/instructions
   - Layout preferences
   - Number of variants

2. **Processing**:
   - Images are uploaded to Supabase Storage
   - A generation task is created in the database
   - The OpenAI API is called with appropriate parameters
   - Generated images are saved back to storage
   - Database records are updated with results

3. **Variation Groups**:
   - Multiple image variations are linked with a `variation_group_id`
   - Each variation has an index to maintain order

## Key Components

### Frontend Components

- **AuthContext**: Manages authentication state across the application
- **DashboardLayout**: Common layout with navigation for authenticated users
- **LazyImage**: Optimized image loading with lazy loading
- **PhotoshootBuilderModal**: Wizard interface for creating new image assets
- **FileUpload**: Drag-and-drop file upload component
- **ImageGallery**: Display and management of generated images
- **ProductsList**: Display and management of Shopify products

### Edge Functions

- **generate-image**: Primary endpoint for image generation that:
  - Validates user authentication
  - Checks credit balance
  - Processes reference images
  - Calls OpenAI API
  - Saves results to storage
  - Updates database records

## Shopify Integration

The application connects to Shopify stores via the Storefront API:

1. Users provide their store URL and Storefront Access Token
2. The application queries the GraphQL API to fetch products and images
3. Product data is cached in the database for better performance
4. Users can select product images as references for AI generation

## User Credits System

The application implements a credit-based system:

1. Each user starts with 10 credits
2. Each image generation (or variant) costs 1 credit
3. Credits are deducted upon successful generation
4. The credit balance is displayed in the UI
5. Credit usage is tracked in the `user_profiles` table

## Development Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Set up environment variables:
   ```
   VITE_SUPABASE_URL=your-supabase-url
   VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

## Deployment

The application is deployed to Netlify using continuous deployment:

1. Build command: `npm run build`
2. Publish directory: `dist`
3. Environment variables set in Netlify dashboard

## Supabase Image Optimization

This project uses Supabase Storage's built-in image transformation capabilities to optimize images on-the-fly without requiring additional storage or pre-processing.

### How It Works

1. **On-the-fly Transformations**: Supabase Storage supports URL parameters to transform images:
   - `width` - Resize the image width (maintains aspect ratio)
   - `height` - Resize the image height (maintains aspect ratio)
   - `quality` - Adjust compression level (0-100)
   - `format` - Convert to different formats (webp, jpeg, png)

2. **Implementation**: The `getImageUrl` utility function generates optimized URLs:
   ```javascript
   // Thumbnail in WebP format
   const thumbnailUrl = getImageUrl(originalUrl, { 
     width: 400, 
     quality: 70, 
     format: 'webp' 
   });
   ```

3. **Lazy Loading**: Images are loaded only when they come into view using the `LazyImage` component, improving performance by reducing unnecessary network requests.

## Project Structure

```
├── public/                # Static assets
├── src/
│   ├── components/        # Reusable UI components
│   ├── hooks/             # Custom React hooks
│   ├── layouts/           # Page layout components
│   ├── lib/               # Utility functions and shared logic
│   ├── pages/             # Page components for each route
│   ├── services/          # API and data services
│   └── App.tsx            # Main application component
├── supabase/
│   ├── functions/         # Supabase Edge Functions
│   └── migrations/        # Database migrations
└── package.json           # Project dependencies and scripts
```