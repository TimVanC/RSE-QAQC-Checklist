import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function ForbiddenPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>No permission</CardTitle>
          <CardDescription>Your role does not include this screen.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button render={<Link href="/" />} nativeButton={false} variant="outline" className="w-full">
            Back to home
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
