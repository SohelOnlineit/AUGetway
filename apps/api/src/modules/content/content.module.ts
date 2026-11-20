import { Module } from "@nestjs/common";
import { BlogService } from "./blog.service";
import { CmsService } from "./cms.service";
import { ContactService } from "./contact.service";
import { ContentController } from "./content.controller";
import { ProductRequestService } from "./product-request.service";
import { UploadsService } from "./uploads.service";

@Module({
  controllers: [ContentController],
  providers: [
    BlogService,
    CmsService,
    ContactService,
    ProductRequestService,
    UploadsService,
  ],
  exports: [
    BlogService,
    CmsService,
    ContactService,
    ProductRequestService,
    UploadsService,
  ],
})
export class ContentModule {}
