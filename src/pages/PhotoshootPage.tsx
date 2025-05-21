import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';

export default function PhotoshootPage() {
  const navigate = useNavigate();
  
  return (
    <div className="max-w-4xl mx-auto py-8 text-center">
      <h1 className="text-2xl font-bold mb-4">Photoshoot Feature</h1>
      <p className="mb-6 text-muted-foreground">
        The photoshoot feature has been replaced with our improved automated ad generation.
      </p>
      <Button onClick={() => navigate('/automation-builder')}>
        Try Automated Ad Generation 
        <ArrowRight className="ml-2 h-4 w-4" />
      </Button>
    </div>
  );
}