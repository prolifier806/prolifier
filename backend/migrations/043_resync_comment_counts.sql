-- Resync comment_count on all posts to match actual rows in comments table.
-- Fixes stale counts caused by deletes that didn't decrement the counter.
UPDATE posts
SET comment_count = (
  SELECT COUNT(*)
  FROM comments
  WHERE comments.post_id = posts.id
);
