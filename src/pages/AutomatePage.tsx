import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Sparkles } from "lucide-react";

export default function AutomatePage() {
  return (
    <div className="max-w-4xl mx-auto w-full py-4 md:py-8">
      <h1 className="text-xl md:text-2xl font-bold mb-6">Automate</h1>
      
      <Alert className="bg-primary/5 border border-primary/20">
        <Sparkles className="h-4 w-4 text-primary" />
        <AlertTitle className="text-base md:text-lg font-medium">Coming Soon</AlertTitle>
        <AlertDescription>
          <p className="text-sm md:text-base">
            The Automate feature is currently in development. Soon you'll be able to set up automated workflows for your image generation.
          </p>
          <p className="text-sm md:text-base mt-2">
            Check back soon for updates!
          </p>
        </AlertDescription>
      </Alert>
      
      <div className="mt-8">
        <h2 className="text-lg md:text-xl font-medium mb-4">What to expect</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="border rounded-lg p-4">
            <h3 className="text-base font-medium mb-2">Scheduled Generation</h3>
            <p className="text-sm text-muted-foreground">
              Schedule your image generation tasks to run automatically at specified intervals.
            </p>
          </div>
          <div className="border rounded-lg p-4">
            <h3 className="text-base font-medium mb-2">Batch Processing</h3>
            <p className="text-sm text-muted-foreground">
              Process multiple images in a batch without manual intervention.
            </p>
          </div>
          <div className="border rounded-lg p-4">
            <h3 className="text-base font-medium mb-2">Integration</h3>
            <p className="text-sm text-muted-foreground">
              Connect with Shopify and other platforms to automate your entire workflow.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}