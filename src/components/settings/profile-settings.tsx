import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { User, Mail } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

export default function ProfileSettings() {
  const { user } = useAuth();

  return (
    <div className="space-y-6">
      {/* Profile Information */}
      <Card className="bg-white !shadow-none border-4 border-white rounded-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Profile Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            {user?.profileImageUrl && (
              <img 
                src={user.profileImageUrl} 
                alt="Profile"
                className="w-16 h-16 rounded-full object-cover"
              />
            )}
            <div className="flex-1">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="firstName">First Name</Label>
                  <Input 
                    id="firstName"
                    value={user?.firstName || ""} 
                    disabled
                    className="bg-mono-gray-50"
                  />
                </div>
                <div>
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input 
                    id="lastName"
                    value={user?.lastName || ""} 
                    disabled
                    className="bg-mono-gray-50"
                  />
                </div>
              </div>
              <div className="mt-4">
                <Label htmlFor="email" className="flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  Email
                </Label>
                <Input 
                  id="email"
                  value={user?.email || ""} 
                  disabled
                  className="bg-mono-gray-50"
                />
              </div>
              <p className="text-sm text-mono-gray-600 mt-2">
                Profile information is managed through your account provider and cannot be edited here.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>


    </div>
  );
}