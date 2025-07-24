# LocalXpose Action Examples

This directory contains example workflows demonstrating various use cases for the LocalXpose GitHub Action.

## Examples

### [multiple-tunnels.yml](./multiple-tunnels.yml)

Demonstrates how to:
- Run multiple services with separate tunnels
- Use different tunnel types (HTTP, TCP)
- Create a microservices setup with service discovery
- Use dynamic subdomains with run numbers

## Important Notes

### PR Comments with Multiple Tunnels

The PR comment feature currently supports only a single tunnel per workflow. When using multiple tunnels:

- Only use `pr-comment: true` on ONE tunnel action
- OR disable PR comments and manually post the URLs using a custom step

Example of custom PR comment for multiple tunnels:

```yaml
- name: Post custom PR comment
  if: github.event_name == 'pull_request'
  uses: actions/github-script@v7
  with:
    script: |
      const urls = {
        api: '${{ steps.api-tunnel.outputs.url }}',
        frontend: '${{ steps.frontend-tunnel.outputs.url }}',
        admin: '${{ steps.admin-tunnel.outputs.url }}'
      };
      
      const body = `## 🚀 Preview Environments Ready!
      
      | Service | URL |
      |---------|-----|
      | API | ${urls.api} |
      | Frontend | ${urls.frontend} |
      | Admin | ${urls.admin} |
      
      All tunnels will remain active for the duration of this workflow.`;
      
      github.rest.issues.createComment({
        issue_number: context.issue.number,
        owner: context.repo.owner,
        repo: context.repo.repo,
        body: body
      });
```

### Running Examples Locally

To test these examples in your own repository:

1. Fork this repository
2. Add `LX_ACCESS_TOKEN` to your repository secrets
3. Navigate to Actions tab
4. Select the example workflow
5. Click "Run workflow"

### Subdomain Naming

When using authenticated tunnels, you can request specific subdomains:
- Use static names for consistent URLs
- Use `${{ github.run_number }}` for unique URLs per run
- Note: Custom subdomains require authentication

### Performance Tips

- Start all your services before creating tunnels
- Use `sleep` to ensure services are ready
- Create tunnels in parallel when possible
- Use regional endpoints closest to your users