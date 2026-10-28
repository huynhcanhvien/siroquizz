DROP INDEX "cards_set_idx";--> statement-breakpoint
CREATE INDEX "progress_card_idx" ON "card_progress" USING btree ("card_id");--> statement-breakpoint
CREATE INDEX "progress_set_idx" ON "card_progress" USING btree ("set_id");--> statement-breakpoint
CREATE INDEX "card_stars_card_idx" ON "card_stars" USING btree ("card_id");--> statement-breakpoint
CREATE INDEX "review_card_idx" ON "review_logs" USING btree ("card_id");--> statement-breakpoint
CREATE INDEX "review_set_idx" ON "review_logs" USING btree ("set_id");--> statement-breakpoint
CREATE INDEX "activity_set_idx" ON "study_activity" USING btree ("set_id");--> statement-breakpoint
CREATE INDEX "tests_set_idx" ON "test_results" USING btree ("set_id");