// Only showing the relevant parts that need modification. The file is very large.
// In the handleSubmit function inside the PhotoshootBuilderModal component:

  // Handle form submission
  const handleSubmit = async () => {
    // Validate requirements
    if (!productImageUrl && !productImage) {
      toast({
        title: "Product image required",
        description: "Please select or upload a product image",
        variant: "destructive"
      });
      setCurrentStep(2);
      return;
    }
    
    if (!prompt.trim()) {
      toast({
        title: "Instructions required",
        description: "Please enter instructions for your creation",
        variant: "destructive"
      });
      setCurrentStep(5);
      return;
    }
    
    if (!assetName.trim()) {
      toast({
        title: "Name required",
        description: "Please provide a name for your asset",
        variant: "destructive"
      });
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      // Submit the form data
      onSubmit({
        name: assetName,
        productImage: productImageUrl || (productImage ? URL.createObjectURL(productImage) : undefined),
        referenceImage: referenceImageUrl || (referenceImage ? URL.createObjectURL(referenceImage) : undefined),
        prompt,
        layout: selectedLayout,
        variants: parseInt(variantCount, 10),
        type: assetType
      });
      
      // Simply show a toast notification and close the modal
      toast({
        title: "Creation started",
        description: "Your images are now being generated. You can view progress here.",
      });
      
      // Close the modal
      onOpenChange(false);
      
      // No navigation - the user stays on the photoshoot page
    } catch (error) {
      console.error("Error creating photoshoot:", error);
      toast({
        title: "Failed to create photoshoot",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive"
      });
      setIsSubmitting(false);
    }
  };