export interface Institution { id: number; name: string; active: boolean; admin: string; location: string; documents: number; requests: number }
export interface Overview { institutions: Institution[]; documents: number; requests: number; pendingApplications: number }
