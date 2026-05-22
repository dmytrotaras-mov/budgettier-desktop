// Phase 1 stub. Single-user local app — no real auth. Returns a fake user
// object loose enough to satisfy the existing type casts in the UI.
export function useAuth() {
  const user: any = {
    id: "local",
    email: "local@budgettier.app",
    firstName: "You",
    lastName: null,
    profileImageUrl: null,
    emailVerified: true,
    verificationToken: null,
    verificationTokenExpiry: null,
    passwordResetToken: null,
    passwordResetExpiry: null,
    password: "",
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  return {
    user,
    isLoading: false,
    isAuthenticated: true,
  };
}
