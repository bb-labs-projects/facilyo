'use client';

import { useState } from 'react';
import { Copy, Check, AlertTriangle, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

interface TempPasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  username: string;
  tempPassword: string;
  expiresAt: string;
  isNewUser?: boolean;
}

export function TempPasswordDialog({
  open,
  onOpenChange,
  username,
  tempPassword,
  expiresAt,
  isNewUser = false,
}: TempPasswordDialogProps) {
  const [copied, setCopied] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleCopy = async () => {
    try {
      const textToCopy = `Benutzername: ${username}\nPasswort: ${tempPassword}`;
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      toast.success('In Zwischenablage kopiert');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Kopieren fehlgeschlagen');
    }
  };

  const expiresDate = new Date(expiresAt);
  const expiresFormatted = expiresDate.toLocaleString('de-CH', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isNewUser ? 'Benutzer erstellt' : 'Passwort zurückgesetzt'}
          </DialogTitle>
          <DialogDescription>
            {isNewUser
              ? 'Der Benutzer wurde erfolgreich erstellt. Geben Sie die Anmeldedaten sicher an den Benutzer weiter.'
              : 'Das Passwort wurde zurückgesetzt. Geben Sie das neue Passwort sicher an den Benutzer weiter.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Warning */}
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 flex items-start gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-amber-700">
              <p className="font-medium">Wichtig:</p>
              <ul className="list-disc list-inside mt-1 space-y-1">
                <li>Dieses Passwort wird nur einmal angezeigt</li>
                <li>Geben Sie es persönlich oder über einen sicheren Kanal weiter</li>
                <li>Der Benutzer muss das Passwort beim ersten Login ändern</li>
              </ul>
            </div>
          </div>

          {/* Credentials */}
          <div className="space-y-3">
            <div className="p-3 rounded-lg bg-slate-100 space-y-2">
              <div>
                <p className="text-xs text-muted-foreground">Benutzername</p>
                <p className="font-mono font-medium">{username}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Temporäres Passwort</p>
                <div className="flex items-center gap-2">
                  <p className="font-mono font-medium flex-1">
                    {showPassword ? tempPassword : '•'.repeat(tempPassword.length)}
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="p-1 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Gültig bis: <span className="font-medium">{expiresFormatted}</span>
            </p>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={handleCopy}
            className="flex-1 sm:flex-none"
          >
            {copied ? (
              <>
                <Check className="h-4 w-4 mr-2" />
                Kopiert
              </>
            ) : (
              <>
                <Copy className="h-4 w-4 mr-2" />
                Kopieren
              </>
            )}
          </Button>
          <Button onClick={() => onOpenChange(false)} className="flex-1 sm:flex-none">
            Schliessen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
