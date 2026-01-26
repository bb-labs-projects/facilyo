'use client';

import { useState } from 'react';
import { AlertTriangle, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

interface ResetPasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userName: string;
  onConfirm: () => Promise<void>;
}

export function ResetPasswordDialog({
  open,
  onOpenChange,
  userName,
  onConfirm,
}: ResetPasswordDialogProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleConfirm = async () => {
    setIsLoading(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <div className="mx-auto mb-4 p-3 rounded-full bg-amber-100 w-fit">
            <KeyRound className="h-6 w-6 text-amber-600" />
          </div>
          <DialogTitle className="text-center">Passwort zurücksetzen</DialogTitle>
          <DialogDescription className="text-center">
            Möchten Sie das Passwort für <strong>{userName}</strong> wirklich zurücksetzen?
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 flex items-start gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-amber-700">
              <p>Bei dieser Aktion wird:</p>
              <ul className="list-disc list-inside mt-1 space-y-1">
                <li>Ein neues temporäres Passwort generiert</li>
                <li>Der Benutzer von allen Geräten abgemeldet</li>
                <li>Der Benutzer muss das Passwort beim nächsten Login ändern</li>
              </ul>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
            className="flex-1 sm:flex-none"
          >
            Abbrechen
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={isLoading}
            className="flex-1 sm:flex-none"
          >
            {isLoading ? 'Wird zurückgesetzt...' : 'Zurücksetzen'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
