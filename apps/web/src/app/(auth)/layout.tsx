import { Card, CardContent } from '@/components/ui/card';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-screen place-items-center p-6">
      <Card className="w-full max-w-96 gap-4">
        <CardContent>{children}</CardContent>
      </Card>
    </main>
  );
}
