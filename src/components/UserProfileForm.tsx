import { useState, useEffect, useRef } from 'react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { Loader2, Upload, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const profileFormSchema = z.object({
  full_name: z.string().min(2, {
    message: "Name must be at least 2 characters.",
  }),
  email: z.string().email({
    message: "Please enter a valid email address.",
  }),
  company_name: z.string().min(1, {
    message: "Company name is required.",
  }),
  store_url: z.string().min(1, {
    message: "Website URL is required.",
  }),
  industry: z.string().min(1, {
    message: "Please select an industry.",
  }),
  annual_revenue: z.string().min(1, {
    message: "Please select annual revenue.",
  }),
  company_logo: z.string().optional(),
});

type ProfileFormValues = z.infer<typeof profileFormSchema>;

const industries = [
  { value: "fashion", label: "Fashion" },
  { value: "electronics", label: "Electronics" },
  { value: "home_living", label: "Home & Living" },
  { value: "beauty", label: "Beauty" },
  { value: "sports", label: "Sports" },
  { value: "food_beverage", label: "Food & Beverage" },
  { value: "health_wellness", label: "Health & Wellness" },
  { value: "toys_games", label: "Toys & Games" },
  { value: "automotive", label: "Automotive" },
  { value: "art_crafts", label: "Art & Crafts" },
  { value: "other", label: "Other" },
];

const revenueRanges = [
  { value: "lt_100k", label: "<$100K" },
  { value: "100k_500k", label: "$100K–500K" },
  { value: "500k_1m", label: "$500K–1M" },
  { value: "1m_5m", label: "$1M–5M" },
  { value: "gt_5m", label: ">$5M" },
];

export function UserProfileForm() {
  const [isLoading, setIsLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      full_name: "",
      email: "",
      company_name: "",
      store_url: "",
      industry: "",
      annual_revenue: "",
      company_logo: "",
    },
    mode: "onChange",
  });

  // Load user profile data on component mount
  useEffect(() => {
    async function loadUserProfile() {
      try {
        setInitialLoading(true);
        
        // Get current user
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) throw new Error("User not found");
        
        // Get user profile data
        const { data: profile, error } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('user_id', user.id)
          .single();
        
        if (error && error.code !== 'PGRST116') {
          // PGRST116 is "No rows found" error, which is fine for new users
          throw error;
        }
        
        if (profile) {
          // Set form values with existing profile data
          // For store_url, strip the "https://" if present
          let storeUrl = profile.store_url || "";
          storeUrl = storeUrl.replace(/^https?:\/\//, '');
          
          form.reset({
            full_name: profile.full_name || "",
            email: user.email || "",
            company_name: profile.company_name || "",
            store_url: storeUrl,
            industry: profile.industry || "",
            annual_revenue: profile.annual_revenue || "",
            company_logo: profile.company_logo || "",
          });
          
          // Set logo preview if exists
          if (profile.company_logo) {
            setLogoPreview(profile.company_logo);
          }
        } else {
          // New user, just populate email
          form.setValue("email", user.email || "");
        }
      } catch (error) {
        console.error("Error loading user profile:", error);
        toast.error("Failed to load profile data");
      } finally {
        setInitialLoading(false);
      }
    }
    
    loadUserProfile();
  }, [form]);

  // Handle logo file selection
  const handleLogoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    // Check file type
    if (!file.type.startsWith('image/')) {
      toast.error("Please select an image file");
      return;
    }
    
    // Check file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error("File size should be less than 5MB");
      return;
    }
    
    setLogoFile(file);
    
    // Create preview URL
    const reader = new FileReader();
    reader.onloadend = () => {
      setLogoPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  // Upload logo to Supabase Storage
  const uploadLogo = async (): Promise<string | null> => {
    if (!logoFile) return form.getValues('company_logo') || null;
    
    try {
      setIsUploadingLogo(true);
      
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");
      
      // Create a unique file path for the logo
      const fileExt = logoFile.name.split('.').pop();
      const fileName = `${user.id}/company-logo-${Date.now()}.${fileExt}`;
      
      // Check if company_logos bucket exists, if not create it
      const { data: buckets } = await supabase.storage.listBuckets();
      const bucketExists = buckets?.some(bucket => bucket.name === 'company_logos');
      
      if (!bucketExists) {
        await supabase.storage.createBucket('company_logos', {
          public: true
        });
      }
      
      // Upload file to Supabase Storage
      const { data, error } = await supabase.storage
        .from('company_logos')
        .upload(fileName, logoFile, {
          upsert: true,
          contentType: logoFile.type
        });
      
      if (error) throw error;
      
      // Get public URL for the uploaded file
      const { data: urlData } = supabase.storage
        .from('company_logos')
        .getPublicUrl(fileName);
      
      return urlData.publicUrl;
    } catch (error) {
      console.error("Error uploading logo:", error);
      toast.error("Failed to upload company logo");
      return null;
    } finally {
      setIsUploadingLogo(false);
    }
  };

  // Remove logo
  const handleRemoveLogo = () => {
    setLogoFile(null);
    setLogoPreview(null);
    form.setValue('company_logo', '');
  };

  // Trigger file input click
  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  async function onSubmit(data: ProfileFormValues) {
    try {
      setIsLoading(true);
      
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) throw new Error("User not authenticated");
      
      // Upload logo if changed
      let logoUrl = data.company_logo;
      if (logoFile) {
        logoUrl = await uploadLogo();
      }
      
      // Prepare store URL with https:// if not present
      let fullStoreUrl = data.store_url;
      if (fullStoreUrl && !fullStoreUrl.match(/^https?:\/\//)) {
        fullStoreUrl = `https://${fullStoreUrl}`;
      }
      
      // Check if profile exists
      const { data: existingProfile, error: checkError } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (checkError) throw checkError;
      
      // Save profile data
      if (existingProfile) {
        // Update existing profile
        const { error: updateError } = await supabase
          .from('user_profiles')
          .update({
            full_name: data.full_name,
            company_name: data.company_name,
            store_url: fullStoreUrl,
            industry: data.industry,
            annual_revenue: data.annual_revenue,
            company_logo: logoUrl,
            updated_at: new Date().toISOString()
          })
          .eq('user_id', user.id);
        
        if (updateError) throw updateError;
      } else {
        // Create new profile
        const { error: insertError } = await supabase
          .from('user_profiles')
          .insert({
            user_id: user.id,
            full_name: data.full_name,
            company_name: data.company_name,
            store_url: fullStoreUrl,
            industry: data.industry,
            annual_revenue: data.annual_revenue,
            company_logo: logoUrl,
          });
        
        if (insertError) throw insertError;
      }
      
      // Update user email if changed
      if (data.email !== user.email) {
        const { error: updateEmailError } = await supabase.auth.updateUser({
          email: data.email,
        });
        
        if (updateEmailError) throw updateEmailError;
      }
      
      toast.success("Profile updated successfully");
    } catch (error) {
      console.error("Error updating profile:", error);
      toast.error("Failed to update profile");
    } finally {
      setIsLoading(false);
    }
  }

  if (initialLoading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-center py-10">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Personal information</h3>
        <p className="text-sm text-muted-foreground">
          Provide your information so that your account can operate correctly.
        </p>
      </div>
      
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          {/* Profile Photo/Logo Section */}
          <div className="space-y-2">
            <h4 className="font-medium">Profile</h4>
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="h-16 w-16 rounded-full overflow-hidden bg-muted">
                  {logoPreview ? (
                    <img 
                      src={logoPreview}
                      alt="Company logo"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center bg-primary/10 text-primary font-bold text-lg">
                      {form.getValues('full_name') ? form.getValues('full_name').charAt(0).toUpperCase() : 'U'}
                    </div>
                  )}
                </div>
              </div>
              
              <Button
                type="button" 
                variant="outline" 
                size="sm"
                onClick={handleUploadClick}
              >
                Replace logo
              </Button>
              
              <input 
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleLogoChange}
                disabled={isLoading}
              />
            </div>
          </div>

          <div className="grid gap-6 pt-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="full_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name <span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                      <Input placeholder="Your full name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email <span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="your.email@example.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="store_url"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Website <span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                      <div className="flex">
                        <Input
                          placeholder="yourstore.com" 
                          {...field}
                          className="rounded-l-none"
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="company_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Company Name <span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                      <Input placeholder="Your company or store name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="industry"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Industry <span className="text-destructive">*</span></FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select your industry" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {industries.map((industry) => (
                          <SelectItem key={industry.value} value={industry.value}>
                            {industry.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="annual_revenue"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Annual Revenue <span className="text-destructive">*</span></FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select revenue range" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {revenueRanges.map((range) => (
                          <SelectItem key={range.value} value={range.value}>
                            {range.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              {/* Hidden field for company_logo */}
              <input 
                type="hidden" 
                {...form.register('company_logo')} 
              />
            </div>
          </div>
          
          <div className="flex justify-start">
            <Button 
              type="submit"
              disabled={isLoading || isUploadingLogo}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving Changes...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}