# HyperAccts.com deployment

Target: the owner's existing Hetzner host. Nginx serves the public website from `/srv/hyperaccts/website`; it does not expose the Windows app's local APIs.

## Cloudflare connection

1. Add `hyperaccts.com` to Cloudflare and change the domain's nameservers at its registrar to the nameservers Cloudflare assigns.
2. Create an `A` record for `@` pointing to `144.76.78.158`. Create `www` as a CNAME to `hyperaccts.com`. Do not add an AAAA record without verifying an appropriate IPv6 address.
3. Initially keep these records DNS-only so an origin certificate can be issued and checked. The server already has Certbot.
4. Once DNS reaches this host, issue the origin certificate for the two names with the Nginx Certbot integration. Enable HTTPS redirection and verify both names.
5. Enable Cloudflare proxying and use SSL/TLS **Full (strict)**. Enable Always Use HTTPS after origin HTTPS works.

The domain was not resolving when this preview was prepared. A working HTTP virtual host does not mean that DNS or public HTTPS is complete.

## Releases

Build the desktop installer, copy it to `website/downloads/HyperAccts-Setup-0.1.0.exe`, and update the website version/download URL together when a new release is ready. Preserve prior versions for rollback. The initial preview is unsigned and should be labeled as such.

For site rollback, restore the previous static directory and validated Nginx configuration. Test Nginx before every reload. This project does not change the server's other sites, firewall, or default virtual host.
