import { formatDistanceToNow } from 'date-fns'
import type { CommentActivity } from '../types'
import { useStore } from '../store'

interface CommentsListProps {
  items: CommentActivity[]
  showMyComment?: boolean
  emptyTitle?: string
  emptyText?: string
}

export function CommentsList({ items, showMyComment, emptyTitle = 'No comments', emptyText = 'Nothing here yet.' }: CommentsListProps) {
  const { markCommentRead, settings } = useStore()

  const visibleItems = settings.hideResolvedComments
    ? items.filter(i => !i.isResolved)
    : items

  if (visibleItems.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-title">{emptyTitle}</div>
        <div className="empty-state-text">{emptyText}</div>
      </div>
    )
  }

  const grouped = new Map<number, { pr: { number: number; title: string; repo: string; url: string }; comments: CommentActivity[] }>()
  for (const item of visibleItems) {
    if (!grouped.has(item.prNumber)) {
      grouped.set(item.prNumber, {
        pr: { number: item.prNumber, title: item.prTitle, repo: item.prRepoFullName, url: item.prHtmlUrl },
        comments: []
      })
    }
    grouped.get(item.prNumber)!.comments.push(item)
  }

  const handleClick = (item: CommentActivity) => {
    if (!item.read) markCommentRead(item.id)
    window.gitbar?.openExternal(item.comment.html_url)
  }

  return (
    <div className="pr-list">
      {Array.from(grouped.values()).map(({ pr, comments }) => (
        <div key={pr.number} className="comment-group">
          <div
            className="comment-group-header"
            onClick={() => window.gitbar?.openExternal(pr.url)}
          >
            <span className="comment-group-repo">{pr.repo}</span>
            <span className="comment-group-title">#{pr.number} {pr.title}</span>
          </div>
          {comments.map(item => (
            <div
              key={item.id}
              className={`comment-item${item.read ? '' : ' comment-unread'}${item.isResolved ? ' comment-resolved' : ''}`}
              onClick={() => handleClick(item)}
            >
              {showMyComment && item.myComment && (
                <div className="comment-my-context">
                  <span className="comment-my-label">You:</span>
                  <span className="comment-my-body">{item.myComment.body.slice(0, 120)}</span>
                </div>
              )}
              <div className="comment-reply">
                <img className="comment-avatar" src={item.comment.user.avatar_url} alt={item.comment.user.login} />
                <div className="comment-reply-content">
                  <div className="comment-reply-meta">
                    <span className="comment-reply-author">{item.comment.user.login}</span>
                    <span className="comment-reply-time">
                      {formatDistanceToNow(new Date(item.comment.created_at), { addSuffix: true })}
                    </span>
                  </div>
                  <div className="comment-reply-body">{item.comment.body.slice(0, 200)}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
