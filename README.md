# Xena - Fully Autonomous Designer for Ecommerce Stores

Xena is an AI-powered ecommerce creative generation platform that helps businesses create professional product imagery and marketing assets using advanced AI technology.

## Features

- **AI Image Generation**: Transform product photos into professional marketing assets
- **Multi-Variant Generation**: Create multiple design variations in a single request
- **Automated Ad Creation**: Generate entire ad campaigns with a single click
- **Image Editing**: Suggest changes to existing generated ads (feature flagged)
- **Shopify Integration**: 
  - Storefront API - Basic product image import
  - Admin API - Enhanced integration for complete store access (New)
- **Creative Management**: Organize and categorize your generated images
- **Reference Image Library**: Store and reuse creative inspiration
- **User Management**: Complete authentication with email verification
- **Credits System**: Track usage with a built-in credits system
- **Stripe Integration**: Purchase credits to generate more images

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

### Payments
- **Stripe**: Secure payment processing for credit purchases
- Credits-based system for usage tracking and monetization

### Deployment
- **Netlify**: Static hosting and continuous deployment
- **Vite**: Fast and modern frontend build tool and development server

## Architecture

### Database Schema

The application uses a relational database with the following key tables:

1. **images**: Stores generated AI images
   - Includes variation tracking via `variation_group_id` and `variation_index`
   
2. **assets**: Unified storage for all image assets
   - Categorized by source: library, reference, shopify, or generated
   - Includes optimization fields for thumbnail and grid views

3. **photoshoots**: Stores photoshoot generation tasks and results
   - Supports different types: photoshoot and static_ad
   - Tracking via batch_id/batch_index and variation fields

4. **generation_tasks**: Tracks image generation processes
   - Batch processing support
   - Status tracking (pending, processing, completed, failed)

5. **user_profiles**: Stores user information and credit balances
   - Manages credits for image generation
   - Tracks usage statistics

6. **shopify_credentials**: Manages Shopify integration data
   - Stores access tokens securely
   - Links to user accounts

7. **shopify_admin_credentials**: Manages enhanced Shopify Admin API integration (New)
   - Provides access to complete store data
   - Securely stores OAuth tokens

8. **shopify_products**: Caches product data from connected stores
   - Stores product details and images
   - Automatically updated on sync

9. **automation_sessions**: Manages automated ad generation
   - Stores session details and parameters
   - Links to prompt variations and generation jobs

10. **prompt_variations**: Stores AI-generated prompt variations for ads
    - Connected to automation sessions
    - Tracks status of prompt generation

11. **generation_jobs**: Tracks individual generation jobs for prompt variations
    - Manages status and results
    - Handles error states

12. **stripe_customers/subscriptions/orders**: Manages payment information
   - Links users to Stripe customers
   - Tracks purchases and credits

### Supabase Integration

The application leverages several Supabase features:

1. **Authentication**: Email/password authentication with OTP verification
   - Secure token-based auth
   - Password reset functionality
   - Google OAuth integration

2. **Storage**: Multiple storage buckets for different asset types
   - Images, user uploads, and Shopify product images
   - Public access with RLS protection

3. **Edge Functions**:
   - `generate-image`: Main image generation endpoint that interfaces with OpenAI
   - `process-generation-task`: Handles individual image generation tasks
   - `monitor-batch-tasks`: Monitors and restarts stalled generation jobs
   - `generate-prompt-variations`: Creates AI-powered ad copy variations
   - `process-generation-job`: Processes individual generation jobs for ad campaigns
   - `create-automation-session`: Creates new automated ad campaign sessions
   - `stripe-checkout`: Handles Stripe payment processing
   - `stripe-webhook`: Processes Stripe webhook events

### Row Level Security (RLS)

Every table is protected with Row Level Security policies to ensure users can only access their own data. The policies follow these patterns:

- SELECT policies: `auth.uid() = user_id`
- INSERT policies: `auth.uid() = user_id`
- UPDATE policies: `auth.uid() = user_id` 
- DELETE policies: `auth.uid() = user_id`

For related tables (like `prompt_variations`), more complex policies check ownership through joins:
```sql
EXISTS (SELECT 1 FROM automation_sessions WHERE automation_sessions.id = prompt_variations.session_id AND automation_sessions.user_id = auth.uid())
```

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

4. **Automated Ads**:
   - AI generates multiple prompt variations based on product and reference
   - Each prompt is used to create a unique ad variant
   - Results are displayed in a gallery view

5. **Image Editing** (Feature Flagged):
   - Users can suggest changes to existing generated images
   - Changes are processed using the OpenAI gpt-image-1 model
   - Modified images appear alongside original generations

## Shopify Integration

The application connects to Shopify stores via two methods:

1. **Storefront API**:
   - Users provide their store URL and Storefront Access Token
   - Basic product data and images are fetched
   - Limited to public product catalog data

2. **Admin API** (New Enhanced Integration):
   - Complete OAuth flow for secure access
   - Access to all store products, inventory, orders, etc.
   - Comprehensive product data for AI image generation
   - Secure token storage and management

## User Credits System

The application implements a credit-based system:

1. Each user starts with 10 credits
2. Each image generation (or variant) costs 1 credit
3. Credits are deducted upon successful generation
4. The credit balance is displayed in the UI
5. Credit usage is tracked in the `user_profiles` table

## Stripe Integration

The application integrates with Stripe for payment processing:

1. **Credit Packages**: Various credit packages are available for purchase
2. **One-Time Purchases**: Credits can be purchased with a one-time payment
3. **Checkout Process**: Secure checkout via Stripe Checkout
4. **Webhook Processing**: Automated credit allocation on successful payment
5. **Order History**: Users can view their purchase history

## Feature Flags

The application uses a feature flag system to control access to new features:

1. **PostHog Integration**: Feature flags are managed through PostHog
2. **Image Editing**: Access to the image editing feature is controlled by a feature flag
3. **Admin API Integration**: The enhanced Shopify Admin API integration visibility is controlled by a feature flag

## Development Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Set up environment variables:
   ```
   VITE_SUPABASE_URL=your-supabase-url
   VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
   VITE_POSTHOG_KEY=your-posthog-key
   VITE_POSTHOG_HOST=your-posthog-host
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

2. **Implementation**: The `getTransformedImageUrl` utility function generates optimized URLs:
   ```javascript
   // Thumbnail in WebP format
   const thumbnailUrl = getTransformedImageUrl(originalUrl, { 
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
│   │   ├── ui/            # shadcn/ui components
│   │   └── ...            # Custom components
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

## Troubleshooting

### Common Issues

1. **Image Generation Failures**:
   - Check user credit balance
   - Verify OpenAI API connectivity
   - Check for large reference images (>10MB)

2. **Photoshoot Synchronization**:
   - If photoshoots are stuck in "processing" state, navigate to a different page and back
   - Check network connectivity

3. **Shopify Connection Issues**:
   - Verify Storefront API token has correct permissions
   - For Admin API, ensure OAuth scopes are properly configured
   - Ensure store URL is correctly formatted

4. **Stripe Payment Failures**:
   - Check Stripe webhook configuration
   - Verify environment variables for Stripe keys