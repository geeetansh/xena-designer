import { ApolloClient, InMemoryCache, createHttpLink, gql } from '@apollo/client';
import { supabase } from '@/lib/supabase';

export interface ShopifyCredentials {
  store_url: string;
  storefront_access_token: string;
}

export interface ShopifyProduct {
  id: string;
  title: string;
  handle: string;
  featuredImage: {
    url: string;
    altText: string;
  };
  images: {
    edges: Array<{
      node: {
        url: string;
        altText: string;
      }
    }>
  };
  variants: {
    edges: Array<{
      node: {
        id: string;
        title: string;
        price: {
          amount: string;
          currencyCode: string;
        }
      }
    }>
  };
}

// Store apollo client in memory to avoid recreating it
let apolloClient: ApolloClient<any> | null = null;
let cachedCredentials: ShopifyCredentials | null = null;

export async function getShopifyCredentials(): Promise<ShopifyCredentials | null> {
  try {
    // Use cached credentials if available
    if (cachedCredentials) {
      return cachedCredentials;
    }
    
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return null;
    }
    
    const { data, error } = await supabase
      .from('shopify_credentials')
      .select('store_url, storefront_access_token')
      .eq('user_id', user.id)
      .maybeSingle();  // Changed from single() to maybeSingle()
    
    if (error) {
      console.error('Error fetching Shopify credentials:', error);
      return null;
    }
    
    if (data) {
      cachedCredentials = data as ShopifyCredentials;
    }
    
    return data as ShopifyCredentials;
  } catch (error) {
    console.error('Error fetching Shopify credentials:', error);
    return null;
  }
}

export async function saveShopifyCredentials(credentials: Omit<ShopifyCredentials, 'user_id'>): Promise<boolean> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error('User not authenticated');
    }
    
    // Check if credentials already exist
    const { data: existingCreds } = await supabase
      .from('shopify_credentials')
      .select('*')
      .eq('user_id', user.id)
      .single();
    
    if (existingCreds) {
      // Update existing credentials
      const { error } = await supabase
        .from('shopify_credentials')
        .update(credentials)
        .eq('user_id', user.id);
      
      if (error) throw error;
    } else {
      // Insert new credentials
      const { error } = await supabase
        .from('shopify_credentials')
        .insert({
          ...credentials,
          user_id: user.id
        });
      
      if (error) throw error;
    }
    
    // Reset apollo client when credentials change
    apolloClient = null;
    cachedCredentials = { ...credentials };
    
    return true;
  } catch (error) {
    console.error('Error saving Shopify credentials:', error);
    return false;
  }
}

export async function deleteShopifyCredentials(): Promise<boolean> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error('User not authenticated');
    }
    
    const { error } = await supabase
      .from('shopify_credentials')
      .delete()
      .eq('user_id', user.id);
    
    if (error) throw error;
    
    // Reset apollo client when credentials are deleted
    apolloClient = null;
    cachedCredentials = null;
    
    return true;
  } catch (error) {
    console.error('Error deleting Shopify credentials:', error);
    return false;
  }
}

async function initializeApolloClient(): Promise<ApolloClient<any> | null> {
  try {
    const credentials = await getShopifyCredentials();
    
    if (!credentials) {
      return null;
    }
    
    const { store_url, storefront_access_token } = credentials;
    
    // Ensure store URL is properly formatted
    const storeUrl = store_url.trim();
    const graphqlUrl = storeUrl.includes('/api/') 
      ? storeUrl 
      : `${storeUrl.replace(/\/$/, '')}/api/2023-10/graphql.json`;
    
    const httpLink = createHttpLink({
      uri: graphqlUrl,
      headers: {
        'X-Shopify-Storefront-Access-Token': storefront_access_token,
        'Content-Type': 'application/json',
      },
    });
    
    return new ApolloClient({
      link: httpLink,
      cache: new InMemoryCache(),
    });
  } catch (error) {
    console.error('Error initializing Apollo client:', error);
    return null;
  }
}

async function getClient(): Promise<ApolloClient<any> | null> {
  if (!apolloClient) {
    apolloClient = await initializeApolloClient();
  }
  return apolloClient;
}

// Cache for Shopify products
let productsCache: {
  products: ShopifyProduct[];
  hasNextPage: boolean;
  endCursor: string | null;
  timestamp: number;
} | null = null;

const PRODUCTS_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export async function fetchShopifyProducts(
  limit: number = 20, 
  cursor?: string
): Promise<{ products: ShopifyProduct[], hasNextPage: boolean, endCursor: string | null }> {
  try {
    // Check cache for first page
    if (!cursor && productsCache && Date.now() - productsCache.timestamp < PRODUCTS_CACHE_DURATION) {
      return {
        products: productsCache.products,
        hasNextPage: productsCache.hasNextPage,
        endCursor: productsCache.endCursor
      };
    }
    
    const client = await getClient();
    
    if (!client) {
      throw new Error('Shopify not connected');
    }
    
    const PRODUCTS_QUERY = gql`
      query GetProducts($cursor: String, $limit: Int!) {
        products(first: $limit, after: $cursor) {
          pageInfo {
            hasNextPage
            endCursor
          }
          edges {
            node {
              id
              title
              handle
              featuredImage {
                url
                altText
              }
              images(first: 10) {
                edges {
                  node {
                    url
                    altText
                  }
                }
              }
              variants(first: 1) {
                edges {
                  node {
                    id
                    title
                    price {
                      amount
                      currencyCode
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;
    
    const { data } = await client.query({
      query: PRODUCTS_QUERY,
      variables: {
        limit,
        cursor: cursor || null,
      },
      fetchPolicy: cursor ? 'network-only' : 'cache-first', // Use cache for first page
    });
    
    const products = data.products.edges.map((edge: any) => edge.node);
    const { hasNextPage, endCursor } = data.products.pageInfo;
    
    // Update cache for first page
    if (!cursor) {
      productsCache = {
        products,
        hasNextPage,
        endCursor,
        timestamp: Date.now()
      };
    }
    
    return {
      products,
      hasNextPage,
      endCursor,
    };
  } catch (error) {
    console.error('Error fetching Shopify products:', error);
    throw error;
  }
}

// Cache test connection results
const connectionTestCache = new Map<string, { isValid: boolean; timestamp: number }>();
const CONNECTION_CACHE_DURATION = 60 * 1000; // 1 minute

export async function testShopifyConnection(credentials: ShopifyCredentials): Promise<boolean> {
  try {
    // Generate a cache key based on the credentials
    const cacheKey = `${credentials.store_url}:${credentials.storefront_access_token}`;
    
    // Check if we have a cached result
    const cachedResult = connectionTestCache.get(cacheKey);
    if (cachedResult && Date.now() - cachedResult.timestamp < CONNECTION_CACHE_DURATION) {
      return cachedResult.isValid;
    }
    
    const { store_url, storefront_access_token } = credentials;
    
    // Ensure store URL is properly formatted
    const storeUrl = store_url.trim();
    const graphqlUrl = storeUrl.includes('/api/') 
      ? storeUrl 
      : `${storeUrl.replace(/\/$/, '')}/api/2023-10/graphql.json`;
    
    const httpLink = createHttpLink({
      uri: graphqlUrl,
      headers: {
        'X-Shopify-Storefront-Access-Token': storefront_access_token,
        'Content-Type': 'application/json',
      },
    });
    
    const testClient = new ApolloClient({
      link: httpLink,
      cache: new InMemoryCache(),
    });
    
    const TEST_QUERY = gql`
      query {
        shop {
          name
        }
      }
    `;
    
    await testClient.query({
      query: TEST_QUERY,
      fetchPolicy: 'network-only',
    });
    
    // Cache the successful result
    connectionTestCache.set(cacheKey, { isValid: true, timestamp: Date.now() });
    
    return true;
  } catch (error) {
    console.error('Error testing Shopify connection:', error);
    return false;
  }
}