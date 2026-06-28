export class ProductBranchDetails {
    id: number;
    productId: number;
    branchId: number;
    price: number;
    stock: number;
    isAvailable: boolean;

    constructor(data: Partial<ProductBranchDetails>) {
        this.id = data.id!;
        this.productId = data.productId!;
        this.branchId = data.branchId!;
        this.price = data.price ?? 0;
        this.stock = data.stock ?? 0;
        this.isAvailable = data.isAvailable ?? false;
    }
}