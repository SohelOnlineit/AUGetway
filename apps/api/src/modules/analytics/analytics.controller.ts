import { Body, Controller, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { AnalyticsService } from "./analytics.service";
import { TrackAnalyticsEventDto, TrackPresenceDto } from "./dto/track-event.dto";

@Controller("analytics")
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Post("events")
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  track(@Body() dto: TrackAnalyticsEventDto) {
    return this.analytics.record(dto);
  }

  @Post("presence")
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  presence(@Body() dto: TrackPresenceDto) {
    return this.analytics.touchPresence(dto.visitorKey);
  }
}
