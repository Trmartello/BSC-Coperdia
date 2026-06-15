-- AddForeignKey
ALTER TABLE "action_items" ADD CONSTRAINT "action_items_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
