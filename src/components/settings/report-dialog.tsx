import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function ReportDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [topic, setTopic] = useState("");
  const [message, setMessage] = useState("");
  const { toast } = useToast();

  const sendReportMutation = useMutation({
    mutationFn: async (data: { topic: string; message: string }) => {
      const response = await apiRequest("POST", "/api/report", data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Report Sent",
        description: "Your report has been sent successfully. Thank you for your feedback!",
      });
      setTopic("");
      setMessage("");
      setIsOpen(false);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to send report. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim() || !message.trim()) {
      toast({
        title: "Missing Information",
        description: "Please fill in both topic and message fields.",
        variant: "destructive",
      });
      return;
    }
    
    sendReportMutation.mutate({
      topic: topic.trim(),
      message: message.trim(),
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button 
          variant="outline" 
          size="sm"
          className="bg-mono-black text-mono-white hover:bg-mono-gray-900 border-mono-black"
          data-testid="button-report"
        >
          <Send className="h-4 w-4 mr-2" />
          Report Issue
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Send Report</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="topic">Topic</Label>
            <Input
              id="topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Brief description of the issue or feedback"
              required
              data-testid="input-report-topic"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="message">Message</Label>
            <Textarea
              id="message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Describe your issue or feedback in detail..."
              className="min-h-[120px]"
              required
              data-testid="textarea-report-message"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsOpen(false)}
              disabled={sendReportMutation.isPending}
              className="flex-1"
              data-testid="button-report-cancel"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={sendReportMutation.isPending || !topic.trim() || !message.trim()}
              className="flex-1 bg-mono-black text-mono-white hover:bg-mono-gray-900"
              data-testid="button-report-submit"
            >
              {sendReportMutation.isPending ? "Sending..." : "Send Report"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}