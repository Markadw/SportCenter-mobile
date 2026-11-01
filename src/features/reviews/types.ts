export interface Review { id: number; productId: number; authorId: number; author: string; rating: number; comment: string; date: string }
export interface ReviewsPage { reviews: Review[]; total: number; average: number }
export interface ReviewEligibility { canReview: boolean; hasDeliveredPurchase: boolean; hasReview: boolean }
export interface ReviewForm { rating: number; comment: string }
export interface ReportForm { name: string; email: string; reason: string }
