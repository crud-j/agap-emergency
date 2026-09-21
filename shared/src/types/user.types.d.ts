import type { UserRole } from '../enums/user-role.enum';
export interface UserProfile {
    id: string;
    email: string | null;
    phone: string | null;
    firstName: string | null;
    lastName: string | null;
    roles: UserRole[];
    isActive: boolean;
    createdAt: string;
}
//# sourceMappingURL=user.types.d.ts.map