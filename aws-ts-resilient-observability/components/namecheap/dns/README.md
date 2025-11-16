# Namecheap DNS Component

Manages DNS records for domains registered with Namecheap.

## Features

- Manage multiple DNS record types (A, AAAA, CNAME, MX, TXT, NS, SRV, CAA, URL redirects)
- Support for custom TTL values
- Validation of record formats
- Merge or overwrite mode for record management

## Prerequisites

You need to configure Namecheap API credentials:

```bash
export NAMECHEAP_USER_NAME="your-username"
export NAMECHEAP_API_USER="your-api-user"
export NAMECHEAP_API_KEY="your-api-key"
export NAMECHEAP_USE_SANDBOX="false"  # Set to "true" for testing
```

## Usage

### Basic Example

```typescript
import { NamecheapDNSComponent } from "./components/namecheap";

const dns = new NamecheapDNSComponent("my-dns", {
    domain: "example.com",
    records: [
        {
            hostname: "@",
            type: "A",
            address: "192.0.2.1",
            ttl: 1800
        },
        {
            hostname: "www",
            type: "CNAME",
            address: "example.com",
            ttl: 3600
        }
    ]
});
```

### MX Records

```typescript
const mailDns = new NamecheapDNSComponent("mail-dns", {
    domain: "example.com",
    records: [
        {
            hostname: "@",
            type: "MX",
            address: "mail.example.com",
            mxPref: 10,
            ttl: 1800
        },
        {
            hostname: "@",
            type: "MX",
            address: "mail2.example.com",
            mxPref: 20,
            ttl: 1800
        }
    ]
});
```

### TXT Records (SPF, DKIM, etc.)

```typescript
const txtDns = new NamecheapDNSComponent("txt-dns", {
    domain: "example.com",
    records: [
        {
            hostname: "@",
            type: "TXT",
            address: "v=spf1 include:_spf.example.com ~all"
        },
        {
            hostname: "_dmarc",
            type: "TXT",
            address: "v=DMARC1; p=quarantine; rua=mailto:dmarc@example.com"
        }
    ]
});
```

### Wildcard Records

```typescript
const wildcardDns = new NamecheapDNSComponent("wildcard-dns", {
    domain: "example.com",
    records: [
        {
            hostname: "*",
            type: "A",
            address: "192.0.2.1"
        }
    ]
});
```

### URL Redirects

```typescript
const redirectDns = new NamecheapDNSComponent("redirect-dns", {
    domain: "example.com",
    records: [
        {
            hostname: "old",
            type: "URL301",
            address: "https://example.com/new-location"
        }
    ]
});
```

## Configuration Options

### NamecheapDNSComponentArgs

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| domain | string | Yes | Domain name to manage |
| records | NamecheapRecordSpec[] | Yes | Array of DNS records |
| mode | "MERGE" \| "OVERWRITE" | No | Record management mode (default: MERGE) |
| emailType | string | No | Email forwarding type |

### NamecheapRecordSpec

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| hostname | string | Yes | Hostname (use "@" for root, "*" for wildcard) |
| type | string | Yes | Record type (A, AAAA, CNAME, MX, TXT, etc.) |
| address | string | Yes | Record value/target |
| mxPref | number | No | MX priority (required for MX records) |
| ttl | number | No | Time to live in seconds (default: 1800) |

## Supported Record Types

- **A**: IPv4 address
- **AAAA**: IPv6 address
- **CNAME**: Canonical name
- **MX**: Mail exchange
- **TXT**: Text record
- **NS**: Name server
- **SRV**: Service record
- **CAA**: Certification Authority Authorization
- **URL**: URL redirect (302)
- **URL301**: Permanent URL redirect (301)
- **FRAME**: Frame redirect

## Outputs

```typescript
const domain = dns.getDomain();  // Get domain name
const records = dns.getRecords();  // Get all record specs
```

## Notes

- TTL values must be between 60 and 86400 seconds
- MX records require the `mxPref` field
- Use "@" for the root domain
- Use "*" for wildcard records
- MERGE mode adds/updates records without removing existing ones
- OVERWRITE mode replaces all records with the specified ones
