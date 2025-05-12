import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { 
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { getInstructions, saveInstructions } from '@/services/settingsService';
import { X, PlusCircle, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export function InstructionsSettings() {
  const [instructions, setInstructions] = useState<string[]>([]);
  const [newInstruction, setNewInstruction] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  // Load instructions on component mount
  useEffect(() => {
    loadInstructions();
  }, []);

  // Load instructions from settings
  const loadInstructions = async () => {
    try {
      setIsLoading(true);
      const instructionList = await getInstructions();
      setInstructions(instructionList);
    } catch (error) {
      console.error('Error loading instructions:', error);
      toast({
        title: 'Failed to load instructions',
        description: 'There was an error loading your photoshoot instructions',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Add a new instruction and save immediately
  const handleAddInstruction = async () => {
    if (!newInstruction.trim()) return;
    
    try {
      setIsSaving(true);
      
      const updatedInstructions = [...instructions, newInstruction.trim()];
      setInstructions(updatedInstructions);
      setNewInstruction('');
      
      // Save to database immediately
      const success = await saveInstructions(updatedInstructions);
      
      if (success) {
        toast({
          title: 'Instruction added',
          description: 'Your photoshoot instruction has been added',
        });
      } else {
        throw new Error('Failed to save instruction');
      }
    } catch (error) {
      console.error('Error saving instruction:', error);
      toast({
        title: 'Failed to add instruction',
        description: 'There was an error saving your instruction',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Remove an instruction and save immediately
  const handleRemoveInstruction = async (index: number) => {
    try {
      setIsSaving(true);
      
      const updatedInstructions = [...instructions];
      updatedInstructions.splice(index, 1);
      setInstructions(updatedInstructions);
      
      // Save to database immediately
      const success = await saveInstructions(updatedInstructions);
      
      if (success) {
        toast({
          title: 'Instruction removed',
          description: 'Your photoshoot instruction has been removed',
        });
      } else {
        throw new Error('Failed to remove instruction');
      }
    } catch (error) {
      console.error('Error removing instruction:', error);
      toast({
        title: 'Failed to remove instruction',
        description: 'There was an error removing your instruction',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Photoshoot Instructions</CardTitle>
          <CardDescription>
            Customize the instruction options that appear when creating photoshoots
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Photoshoot Instructions</CardTitle>
        <CardDescription>
          Customize the instruction options that appear when creating photoshoots
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="add-instruction">Add New Instruction</Label>
          <div className="flex gap-2">
            <Input
              id="add-instruction"
              placeholder="Enter a new instruction..."
              value={newInstruction}
              onChange={(e) => setNewInstruction(e.target.value)}
              className="flex-1"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newInstruction.trim()) {
                  e.preventDefault();
                  handleAddInstruction();
                }
              }}
            />
            <Button 
              onClick={handleAddInstruction}
              disabled={!newInstruction.trim() || isSaving}
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <PlusCircle className="h-4 w-4 mr-2" />
                  Add
                </>
              )}
            </Button>
          </div>
        </div>
        
        <Separator />
        
        <div className="space-y-2">
          <Label>Current Instructions</Label>
          <p className="text-sm text-muted-foreground mb-4">
            These instructions will appear as options when creating photoshoots
          </p>
          
          {instructions.length === 0 ? (
            <div className="border rounded-md p-8 text-center">
              <p className="text-muted-foreground">No instructions added yet</p>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {instructions.map((instruction, index) => (
                <div 
                  key={index} 
                  className="flex items-center gap-1 bg-muted rounded-full px-3 py-1"
                >
                  <span className="text-sm">{instruction}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveInstruction(index)}
                    className="h-5 w-5 p-0 rounded-full hover:bg-muted-foreground/20"
                    disabled={isSaving}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}