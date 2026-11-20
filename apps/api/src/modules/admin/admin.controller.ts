import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequirePermissions } from "../auth/decorators/permissions.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { AdminAuditService } from "./admin-audit.service";
import { AdminSecurityService } from "./admin-security.service";
import { AdminCatalogService } from "./admin-catalog.service";
import { AdminCustomersService } from "./admin-customers.service";
import { AdminDashboardService } from "./admin-dashboard.service";
import { AdminInventoryService } from "./admin-inventory.service";
import { AdminOrdersService } from "./admin-orders.service";
import { AdminWalletService } from "./admin-wallet.service";
import { AdminAuditListQuery } from "./dto/audit.dto";
import {
  AdminProductListQuery,
  ReorderProductsDto,
  UpsertAdminBrandDto,
  UpsertAdminCategoryDto,
  UpsertAdminProductDto,
} from "./dto/catalog.dto";
import {
  AdminCustomerListQuery,
  CreateAdminCustomerDto,
  CreateAdminStaffDto,
  UpdateAdminCustomerDto,
  UpdateAdminCustomerNoteDto,
} from "./dto/customers.dto";
import {
  AddInventoryCodesDto,
  AddManualInventoryCodeDto,
  AdminInventoryListQuery,
  UpdateInventoryUnitStatusDto,
} from "./dto/inventory.dto";
import {
  AdminOrderActionDto,
  AdminOrderCustomerInputDto,
  AdminOrderCustomerNoteDto,
  AdminOrderListQuery,
  UpdateDeliveryCodeDto,
} from "./dto/orders.dto";
import { AdminWalletAdjustDto, AdminWalletListQuery } from "./dto/wallet-adjust.dto";
import { AdminPaymentsService } from "../refunds/admin-payments.service";
import { RefundsService } from "../refunds/refunds.service";
import { AdminPaymentListQuery } from "../refunds/dto/admin-payment-list.query";
import { AdminRefundActionDto } from "../refunds/dto/admin-refund-action.dto";
import { AdminRefundListQuery } from "../refunds/dto/admin-refund-list.query";
import { SandboxRefundSimulateDto } from "../refunds/dto/sandbox-refund-simulate.dto";
import { TicketsService } from "../tickets/tickets.service";
import {
  AdminTicketListQuery,
  AdminTicketUpdateDto,
} from "../tickets/dto/admin-ticket.dto";
import { TicketReplyDto } from "../tickets/dto/ticket-reply.dto";
import {
  AdminChatRoomListQuery,
  ChatService,
} from "../chat/chat.service";
import { AdminSeoService } from "./admin-seo.service";
import { RegistrationEmailDomainsBodyDto } from "./dto/registration-email-domains.dto";
import { UpdateAdminAppearanceDto } from "./dto/appearance.dto";
import { UpdateAdminRouteSeoDto, UpdateAdminSeoSettingsDto } from "./dto/seo.dto";
import { AnalyticsService } from "../analytics/analytics.service";
import { BlogService } from "../content/blog.service";
import { CmsService } from "../content/cms.service";
import { ContactService } from "../content/contact.service";
import { ProductRequestService } from "../content/product-request.service";
import { UploadsService } from "../content/uploads.service";
import {
  AdminBlogListQuery,
  PublishBlogPostDto,
  UpsertBlogCategoryDto,
  UpsertBlogPostDto,
} from "../content/dto/blog.dto";
import {
  SitePageKeyDto,
  UpsertHomepageSectionDto,
  UpsertHomepageSlideDto,
  UpsertNavigationItemDto,
  UpsertSitePageDto,
} from "../content/dto/cms.dto";
import {
  AdminContactListQuery,
  AdminContactReplyDto,
  AdminContactUpdateDto,
} from "../content/dto/contact.dto";
import {
  AdminProductRequestListQuery,
  AdminProductRequestUpdateDto,
} from "../content/dto/product-request.dto";
import { UploadImageDto } from "../content/dto/upload.dto";
import { BlogPostStatus, ReviewStatus, SitePageKey } from "../../generated/prisma/client";
import { PointsService } from "../points/points.service";
import { CouponsService } from "../promotions/coupons.service";
import { ReviewsService } from "../promotions/reviews.service";
import { UpsertCouponDto } from "../promotions/dto/coupon.dto";
import {
  AdminReviewListQuery,
  ModerateReviewDto,
} from "../promotions/dto/review.dto";
import { AdminPaginationQuery } from "./dto/admin-common.dto";
import { AuditService } from "../../shared/audit/audit.service";
import { AccessBlockService } from "../../shared/security/access-block.service";
import { RegistrationEmailDomainsService } from "../../shared/security/registration-email-domains.service";
import { CreateAccessBlockDto } from "./dto/access-block.dto";
import { PaymentGatewaySettingsService } from "../payments/payment-gateway-settings.service";
import { UpdateUddoktaPayDto } from "../payments/dto/uddoktapay.dto";

@Controller("admin")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions("admin:access")
export class AdminController {
  constructor(
    private readonly dashboard: AdminDashboardService,
    private readonly catalog: AdminCatalogService,
    private readonly inventory: AdminInventoryService,
    private readonly orders: AdminOrdersService,
    private readonly customers: AdminCustomersService,
    private readonly wallet: AdminWalletService,
    private readonly audit: AdminAuditService,
    private readonly security: AdminSecurityService,
    private readonly tickets: TicketsService,
    private readonly chat: ChatService,
    private readonly payments: AdminPaymentsService,
    private readonly refunds: RefundsService,
    private readonly seo: AdminSeoService,
    private readonly analytics: AnalyticsService,
    private readonly blog: BlogService,
    private readonly cms: CmsService,
    private readonly contactInbox: ContactService,
    private readonly productRequests: ProductRequestService,
    private readonly uploads: UploadsService,
    private readonly auditWriter: AuditService,
    private readonly coupons: CouponsService,
    private readonly points: PointsService,
    private readonly reviews: ReviewsService,
    private readonly paymentGateways: PaymentGatewaySettingsService,
    private readonly registrationEmailDomains: RegistrationEmailDomainsService,
    private readonly accessBlocks: AccessBlockService,
  ) {}

  @Get("me")
  me(@CurrentUser() user: AuthenticatedUser) {
    return {
      userId: user.id,
      roles: user.roles,
      permissions: user.permissions,
    };
  }

  @Get("dashboard")
  @RequirePermissions("admin:access")
  dashboardSummary() {
    return this.dashboard.summary();
  }

  @Get("dashboard/deliveries")
  @RequirePermissions("admin:orders:read")
  dashboardDeliveries() {
    return this.dashboard.recentDeliveries();
  }

  // —— Catalog ——
  @Get("products")
  @RequirePermissions("admin:catalog:read")
  listProducts(@Query() query: AdminProductListQuery) {
    return this.catalog.listProducts(query);
  }

  @Patch("products/order")
  @RequirePermissions("admin:catalog:write")
  reorderProducts(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ReorderProductsDto,
  ) {
    return this.catalog.reorderProducts(user.id, dto.ids);
  }

  @Get("products/:id")
  @RequirePermissions("admin:catalog:read")
  getProduct(@Param("id") id: string) {
    return this.catalog.getProduct(id);
  }

  @Post("products")
  @RequirePermissions("admin:catalog:write")
  createProduct(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpsertAdminProductDto,
  ) {
    return this.catalog.createProduct(user.id, dto);
  }

  @Put("products/:id")
  @RequirePermissions("admin:catalog:write")
  updateProduct(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: UpsertAdminProductDto,
  ) {
    return this.catalog.updateProduct(user.id, id, dto);
  }

  @Get("categories")
  @RequirePermissions("admin:catalog:read")
  listCategories() {
    return this.catalog.listCategories();
  }

  @Post("categories")
  @RequirePermissions("admin:catalog:write")
  createCategory(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpsertAdminCategoryDto,
  ) {
    return this.catalog.upsertCategory(user.id, dto);
  }

  @Put("categories/:id")
  @RequirePermissions("admin:catalog:write")
  updateCategory(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: UpsertAdminCategoryDto,
  ) {
    return this.catalog.upsertCategory(user.id, dto, id);
  }

  @Delete("categories/:id")
  @RequirePermissions("admin:catalog:write")
  deleteCategory(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
  ) {
    return this.catalog.deleteCategory(user.id, id);
  }

  @Get("brands")
  @RequirePermissions("admin:catalog:read")
  listBrands() {
    return this.catalog.listBrands();
  }

  @Post("brands")
  @RequirePermissions("admin:catalog:write")
  createBrand(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpsertAdminBrandDto,
  ) {
    return this.catalog.upsertBrand(user.id, dto);
  }

  @Put("brands/:id")
  @RequirePermissions("admin:catalog:write")
  updateBrand(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: UpsertAdminBrandDto,
  ) {
    return this.catalog.upsertBrand(user.id, dto, id);
  }

  // —— Inventory ——
  @Get("inventory")
  @RequirePermissions("admin:inventory:read")
  listInventory(@Query() query: AdminInventoryListQuery) {
    return this.inventory.list(query);
  }

  @Get("inventory/packages")
  @RequirePermissions("admin:inventory:read")
  inventoryPackages(@Query("productId") productId = "") {
    return this.inventory.availablePackages(productId);
  }

  @Post("inventory/manual")
  @RequirePermissions("admin:inventory:write")
  addManualInventoryCode(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AddManualInventoryCodeDto,
  ) {
    return this.inventory.addManualCode(user.id, dto);
  }

  @Post("inventory/import")
  @RequirePermissions("admin:inventory:write")
  importInventory(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AddInventoryCodesDto,
  ) {
    return this.inventory.addCodes(user.id, dto);
  }

  @Get("inventory/:id/code")
  @RequirePermissions("admin:inventory:read")
  revealInventoryCode(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.inventory.revealCode(user.id, id);
  }

  @Patch("inventory/:id/status")
  @RequirePermissions("admin:inventory:write")
  updateInventoryStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: UpdateInventoryUnitStatusDto,
  ) {
    return this.inventory.updateUnitStatus(user.id, id, dto);
  }

  // —— Orders ——
  @Get("orders")
  @RequirePermissions("admin:orders:read")
  listOrders(@Query() query: AdminOrderListQuery) {
    return this.orders.list(query);
  }

  @Get("orders/:id")
  @RequirePermissions("admin:orders:read")
  getOrder(@Param("id") id: string) {
    return this.orders.get(id);
  }

  @Patch("orders/:id/cards/:inventoryItemId")
  @RequirePermissions("admin:orders:write")
  updateOrderCardCode(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Param("inventoryItemId") inventoryItemId: string,
    @Body() dto: UpdateDeliveryCodeDto,
  ) {
    return this.orders.updateCardCode(user.id, id, inventoryItemId, dto.code);
  }

  @Delete("orders/:id/cards/:inventoryItemId")
  @RequirePermissions("admin:orders:write")
  removeOrderCard(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Param("inventoryItemId") inventoryItemId: string,
  ) {
    return this.orders.removeCard(user.id, id, inventoryItemId);
  }

  @Post("orders/:id/customer-note")
  @RequirePermissions("admin:orders:write")
  sendOrderCustomerNote(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: AdminOrderCustomerNoteDto,
    @Headers("x-storefront") storefront?: string,
  ) {
    return this.orders.sendCustomerNote(user.id, id, dto, storefront);
  }

  @Patch("orders/:id/items/:itemId/customer-inputs")
  @RequirePermissions("admin:orders:write")
  updateOrderCustomerInput(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Param("itemId") itemId: string,
    @Body() dto: AdminOrderCustomerInputDto,
  ) {
    return this.orders.updateCustomerInput(user.id, id, itemId, dto);
  }

  @Post("orders/:id/actions")
  @RequirePermissions("admin:orders:write")
  orderAction(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: AdminOrderActionDto,
  ) {
    return this.orders.applyAction(user.id, id, dto);
  }

  @Get("staff")
  @RequirePermissions("admin:users:write")
  listStaff() {
    return this.customers.listStaff();
  }

  @Post("staff")
  @RequirePermissions("admin:users:write")
  createStaff(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateAdminStaffDto,
  ) {
    return this.customers.createStaff(user.id, dto);
  }

  // —— Customers ——
  @Get("customers")
  @RequirePermissions("admin:customers:read")
  listCustomers(@Query() query: AdminCustomerListQuery) {
    return this.customers.list(query);
  }

  @Post("customers")
  @RequirePermissions("admin:customers:read")
  createCustomer(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateAdminCustomerDto,
  ) {
    return this.customers.createCustomer(user.id, dto);
  }

  @Get("customers/:id")
  @RequirePermissions("admin:customers:read")
  getCustomer(@Param("id") id: string) {
    return this.customers.get(id);
  }

  @Delete("customers/:id")
  @RequirePermissions("admin:customers:read")
  deleteCustomer(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
  ) {
    return this.customers.remove(user.id, id);
  }

  @Patch("customers/:id")
  @RequirePermissions("admin:customers:read")
  updateCustomer(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: UpdateAdminCustomerDto,
  ) {
    return this.customers.updateProfile(user.id, id, dto);
  }

  @Patch("customers/:id/note")
  @RequirePermissions("admin:customers:read")
  updateCustomerNote(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: UpdateAdminCustomerNoteDto,
  ) {
    return this.customers.updateNote(user.id, id, dto);
  }

  @Get("wallets")
  @RequirePermissions("admin:wallet:adjust")
  listWallets(@Query() query: AdminWalletListQuery) {
    return this.wallet.list(query);
  }

  @Get("wallets/activity")
  @RequirePermissions("admin:wallet:adjust")
  walletActivity() {
    return this.wallet.activity();
  }

  @Post("customers/:id/wallet/adjust")
  @RequirePermissions("admin:wallet:adjust")
  adjustWallet(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: AdminWalletAdjustDto,
  ) {
    return this.wallet.adjust(user.id, id, dto);
  }

  // —— Payments ——
  @Get("payments")
  @RequirePermissions("admin:payments:read")
  listPayments(@Query() query: AdminPaymentListQuery) {
    return this.payments.list(query);
  }

  @Get("payments/:id")
  @RequirePermissions("admin:payments:read")
  getPayment(@Param("id") id: string) {
    return this.payments.get(id);
  }

  @Get("payment-gateways/uddoktapay")
  @RequirePermissions("admin:payments:read")
  getUddoktaPay() {
    return this.paymentGateways.getAdmin();
  }

  @Patch("payment-gateways/uddoktapay")
  @RequirePermissions("admin:payments:read")
  updateUddoktaPay(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateUddoktaPayDto,
  ) {
    return this.paymentGateways.update(dto).then(async (saved) => {
      await this.auditWriter.record({
        action: "payment.gateway_updated",
        userId: user.id,
        metadata: {
          gateway: "uddoktapay",
          enabled: saved.enabled,
          sandbox: saved.sandbox,
          mode: saved.mode,
        },
      });
      return saved;
    });
  }

  // —— Refunds ——
  @Get("refunds")
  @RequirePermissions("admin:refunds:read")
  listRefunds(@Query() query: AdminRefundListQuery) {
    return this.refunds.adminList(query);
  }

  @Get("refunds/:id")
  @RequirePermissions("admin:refunds:read")
  getRefund(@Param("id") id: string) {
    return this.refunds.adminGet(id);
  }

  @Post("refunds/:id/actions")
  @RequirePermissions("admin:refunds:write")
  refundAction(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: AdminRefundActionDto,
  ) {
    return this.refunds.adminAction(user.id, id, dto);
  }

  @Post("refunds/:id/sandbox-simulate")
  @RequirePermissions("admin:refunds:write")
  sandboxRefundSimulate(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: SandboxRefundSimulateDto,
  ) {
    return this.refunds.sandboxSimulate(
      user.id,
      id,
      dto.outcome,
      dto.reason,
    );
  }

  // —— Support tickets ——
  @Get("tickets")
  @RequirePermissions("admin:support:read")
  listTickets(@Query() query: AdminTicketListQuery) {
    return this.tickets.adminList(query);
  }

  @Get("tickets/:id")
  @RequirePermissions("admin:support:read")
  getTicket(@Param("id") id: string) {
    return this.tickets.adminGet(id);
  }

  @Patch("tickets/:id")
  @RequirePermissions("admin:support:write")
  updateTicket(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: AdminTicketUpdateDto,
  ) {
    return this.tickets.adminUpdate(user.id, id, dto);
  }

  @Post("tickets/:id/replies")
  @RequirePermissions("admin:support:write")
  replyTicket(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: TicketReplyDto,
  ) {
    return this.tickets.adminReply(user.id, id, dto);
  }

  // —— Support chat ——
  @Get("chat/rooms")
  @RequirePermissions("admin:chat:access")
  listChatRooms(@Query() query: AdminChatRoomListQuery) {
    return this.chat.adminListRooms(query);
  }

  @Get("chat/rooms/:id")
  @RequirePermissions("admin:chat:access")
  getChatRoom(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
  ) {
    return this.chat.getRoomForUser(user.id, user.roles, id);
  }

  // —— Appearance ——
  @Get("appearance")
  @RequirePermissions("admin:seo:read")
  getAppearance() {
    return this.seo.getAppearance();
  }

  @Put("appearance")
  @RequirePermissions("admin:seo:write")
  updateAppearance(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateAdminAppearanceDto,
  ) {
    return this.seo.updateAppearance(user.id, dto);
  }

  // —— SEO ——
  @Get("seo/settings")
  @RequirePermissions("admin:seo:read")
  getSeoSettings(@Query("shop") shop?: string) {
    return this.seo.get(shop);
  }

  @Put("seo/settings")
  @RequirePermissions("admin:seo:write")
  updateSeoSettings(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateAdminSeoSettingsDto,
  ) {
    return this.seo.update(user.id, dto);
  }

  @Get("seo/routes")
  @RequirePermissions("admin:seo:read")
  listSeoRoutes(@Query("shop") shop?: string) {
    return this.seo.listRoutes(shop);
  }

  @Put("seo/routes/:key")
  @RequirePermissions("admin:seo:write")
  updateSeoRoute(
    @CurrentUser() user: AuthenticatedUser,
    @Param("key") key: string,
    @Body() dto: UpdateAdminRouteSeoDto,
  ) {
    return this.seo.updateRoute(user.id, key, dto);
  }

  // —— Analytics ——
  @Get("analytics/summary")
  @RequirePermissions("admin:analytics:read")
  analyticsSummary(@Query("days") days?: string) {
    const parsed = days ? Number.parseInt(days, 10) : 7;
    return this.analytics.summary(Number.isFinite(parsed) ? parsed : 7);
  }

  @Get("analytics/live")
  @RequirePermissions("admin:analytics:read")
  analyticsLive() {
    return this.analytics.live();
  }

  // —— Content / CMS ——
  @Get("blog/categories")
  @RequirePermissions("admin:content:read")
  listBlogCategories() {
    return this.blog.adminListCategories();
  }

  @Post("blog/categories")
  @RequirePermissions("admin:content:write")
  createBlogCategory(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpsertBlogCategoryDto,
  ) {
    return this.blog.adminCreateCategory(user.id, dto);
  }

  @Put("blog/categories/:id")
  @RequirePermissions("admin:content:write")
  updateBlogCategory(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: UpsertBlogCategoryDto,
  ) {
    return this.blog.adminUpdateCategory(user.id, id, dto);
  }

  @Get("blog/posts")
  @RequirePermissions("admin:content:read")
  listBlogPosts(@Query() query: AdminBlogListQuery) {
    return this.blog.adminListPosts(query);
  }

  @Get("blog/posts/:id")
  @RequirePermissions("admin:content:read")
  getBlogPost(@Param("id") id: string) {
    return this.blog.adminGetPost(id);
  }

  @Post("blog/posts")
  @RequirePermissions("admin:content:write")
  createBlogPost(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpsertBlogPostDto,
  ) {
    return this.blog.adminCreatePost(user.id, dto);
  }

  @Put("blog/posts/:id")
  @RequirePermissions("admin:content:write")
  updateBlogPost(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: UpsertBlogPostDto,
  ) {
    return this.blog.adminUpdatePost(user.id, id, dto);
  }

  @Patch("blog/posts/:id/status")
  @RequirePermissions("admin:content:write")
  setBlogPostStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: PublishBlogPostDto,
  ) {
    return this.blog.adminSetPostStatus(
      user.id,
      id,
      dto.status as BlogPostStatus,
    );
  }

  @Get("cms/slides")
  @RequirePermissions("admin:content:read")
  listSlides() {
    return this.cms.listSlidesAdmin();
  }

  @Post("cms/slides")
  @RequirePermissions("admin:content:write")
  createSlide(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpsertHomepageSlideDto,
  ) {
    return this.cms.createSlide(user.id, dto);
  }

  @Put("cms/slides/:id")
  @RequirePermissions("admin:content:write")
  updateSlide(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: UpsertHomepageSlideDto,
  ) {
    return this.cms.updateSlide(user.id, id, dto);
  }

  @Delete("cms/slides/:id")
  @RequirePermissions("admin:content:write")
  deleteSlide(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
  ) {
    return this.cms.deleteSlide(user.id, id);
  }

  @Get("cms/sections")
  @RequirePermissions("admin:content:read")
  listSections() {
    return this.cms.listSectionsAdmin();
  }

  @Post("cms/sections")
  @RequirePermissions("admin:content:write")
  createSection(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpsertHomepageSectionDto,
  ) {
    return this.cms.createSection(user.id, dto);
  }

  @Put("cms/sections/:id")
  @RequirePermissions("admin:content:write")
  updateSection(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: UpsertHomepageSectionDto,
  ) {
    return this.cms.updateSection(user.id, id, dto);
  }

  @Delete("cms/sections/:id")
  @RequirePermissions("admin:content:write")
  deleteSection(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
  ) {
    return this.cms.deleteSection(user.id, id);
  }

  @Get("cms/navigation")
  @RequirePermissions("admin:content:read")
  listNav() {
    return this.cms.listNavAdmin();
  }

  @Post("cms/navigation")
  @RequirePermissions("admin:content:write")
  createNav(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpsertNavigationItemDto,
  ) {
    return this.cms.createNav(user.id, dto);
  }

  @Put("cms/navigation/:id")
  @RequirePermissions("admin:content:write")
  updateNav(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: UpsertNavigationItemDto,
  ) {
    return this.cms.updateNav(user.id, id, dto);
  }

  @Delete("cms/navigation/:id")
  @RequirePermissions("admin:content:write")
  deleteNav(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
  ) {
    return this.cms.deleteNav(user.id, id);
  }

  @Get("cms/pages")
  @RequirePermissions("admin:content:read")
  listPages() {
    return this.cms.listPagesAdmin();
  }

  @Put("cms/pages/:key")
  @RequirePermissions("admin:content:write")
  updatePage(
    @CurrentUser() user: AuthenticatedUser,
    @Param("key") key: string,
    @Body() dto: UpsertSitePageDto,
  ) {
    if (!(Object.values(SitePageKeyDto) as string[]).includes(key)) {
      throw new BadRequestException("Invalid page key");
    }
    return this.cms.updatePage(user.id, key as SitePageKey, dto);
  }

  @Post("uploads/images")
  @RequirePermissions("admin:content:write")
  async uploadImage(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UploadImageDto,
  ) {
    const raw = dto.dataBase64.includes(",")
      ? dto.dataBase64.split(",")[1]!
      : dto.dataBase64;
    let buffer: Buffer;
    try {
      buffer = Buffer.from(raw, "base64");
    } catch {
      throw new BadRequestException("Invalid base64 payload");
    }
    const result = await this.uploads.savePublicCmsImage(
      buffer,
      dto.contentType,
    );
    await this.auditWriter.record({
      action: "admin.content.image_uploaded",
      userId: user.id,
      entityType: "upload",
      entityId: result.path,
      metadata: { bytes: result.bytes, contentType: result.contentType },
    });
    return result;
  }

  @Get("contact")
  @RequirePermissions("admin:contact:read")
  listContact(@Query() query: AdminContactListQuery) {
    return this.contactInbox.adminList(query);
  }

  @Get("contact/:id")
  @RequirePermissions("admin:contact:read")
  getContact(@Param("id") id: string) {
    return this.contactInbox.adminGet(id);
  }

  @Patch("contact/:id")
  @RequirePermissions("admin:contact:write")
  updateContact(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: AdminContactUpdateDto,
  ) {
    return this.contactInbox.adminUpdate(user.id, id, dto);
  }

  @Post("contact/:id/reply")
  @RequirePermissions("admin:contact:write")
  replyContact(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: AdminContactReplyDto,
    @Headers("x-storefront") storefront?: string,
  ) {
    return this.contactInbox.adminReply(user.id, id, dto, storefront);
  }

  @Get("product-requests")
  @RequirePermissions("admin:product-requests:read")
  listProductRequests(@Query() query: AdminProductRequestListQuery) {
    return this.productRequests.adminList(query);
  }

  @Get("product-requests/:id")
  @RequirePermissions("admin:product-requests:read")
  getProductRequest(@Param("id") id: string) {
    return this.productRequests.adminGet(id);
  }

  @Patch("product-requests/:id")
  @RequirePermissions("admin:product-requests:write")
  updateProductRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: AdminProductRequestUpdateDto,
    @Headers("x-storefront") storefront?: string,
  ) {
    return this.productRequests.adminUpdate(user.id, id, dto, storefront);
  }

  @Get("points")
  @RequirePermissions("admin:points:read")
  pointsState() {
    return this.points.adminState();
  }

  @Put("points")
  @RequirePermissions("admin:points:write")
  savePoints(@Body() body: unknown) {
    return this.points.saveAdmin(body);
  }

  @Get("coupons")
  @RequirePermissions("admin:coupons:read")
  listCoupons(@Query() query: AdminPaginationQuery) {
    return this.coupons.adminList(query);
  }

  @Post("coupons")
  @RequirePermissions("admin:coupons:write")
  createCoupon(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpsertCouponDto,
  ) {
    return this.coupons.adminCreate(user.id, dto);
  }

  @Put("coupons/:id")
  @RequirePermissions("admin:coupons:write")
  updateCoupon(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: UpsertCouponDto,
  ) {
    return this.coupons.adminUpdate(user.id, id, dto);
  }

  @Get("reviews")
  @RequirePermissions("admin:reviews:read")
  listReviews(@Query() query: AdminReviewListQuery) {
    return this.reviews.adminList({
      ...query,
      status: query.status as ReviewStatus | undefined,
    });
  }

  @Patch("reviews/:id")
  @RequirePermissions("admin:reviews:write")
  moderateReview(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: ModerateReviewDto,
  ) {
    return this.reviews.adminSetStatus(user.id, id, dto.status as ReviewStatus);
  }

  @Get("security/overview")
  @RequirePermissions("admin:audit:read")
  securityOverview() {
    return this.security.overview();
  }

  @Get("security/registration-email-domains")
  @RequirePermissions("admin:audit:read")
  getRegistrationEmailDomains() {
    return this.registrationEmailDomains.get();
  }

  @Put("security/registration-email-domains")
  @RequirePermissions("admin:users:write")
  updateRegistrationEmailDomains(@Body() dto: RegistrationEmailDomainsBodyDto) {
    return this.registrationEmailDomains.set({
      allow: dto.allow ?? [],
      block: dto.block ?? [],
    });
  }

  @Get("security/access-blocks")
  @RequirePermissions("admin:audit:read")
  listAccessBlocks() {
    return this.accessBlocks.list();
  }

  @Post("security/access-blocks")
  @RequirePermissions("admin:users:write")
  createAccessBlock(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateAccessBlockDto) {
    return this.accessBlocks.add(dto, user.id);
  }

  @Delete("security/access-blocks/:id")
  @RequirePermissions("admin:users:write")
  async removeAccessBlock(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    await this.accessBlocks.remove(id, user.id);
    return { ok: true };
  }

  // —— Audit ——
  @Get("audit")
  @RequirePermissions("admin:audit:read")
  listAudit(@Query() query: AdminAuditListQuery) {
    return this.audit.list(query);
  }

  @Get("audit/:id")
  @RequirePermissions("admin:audit:read")
  getAudit(@Param("id") id: string) {
    return this.audit.get(id);
  }
}
