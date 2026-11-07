# Legitfy

Legitfy lets anyone check whether a document is genuine, directly against a public record, and gives institutions one private place to issue documents and answer verification requests.

**Status:** pre-launch. Nothing is live on a public network yet.

## The problem

Certificates decide who gets hired, promoted or admitted, but the way they're checked hasn't kept up.

- **A document that looks right proves very little.** A convincing fake is easy to make, and a stamp or signature can be copied.
- **Checking depends on who you can reach.** Employers and universities email or phone registrars, then wait days or weeks, often with no answer.
- **Institutions carry the load by hand.** Requests arrive through inboxes and front desks, with no owner, no deadline and no record of who answered.
- **Personal documents travel too far.** Certificates get forwarded and left in inboxes, with no way to see who opened them or take them back.

## What Legitfy does

- **Institutions are checked first.** Each one applies with its registration documents, and the person applying has their identity confirmed before approval.
- **Institutions publish a fingerprint of each document.** The fingerprint goes on a public blockchain, and the document stays private.
- **Anyone can check, free.** Drop in a file, scan its seal or type its certificate ID to see who issued it and whether it still stands. No account is needed, and the file never leaves your device.
- **Employers can check many at once.** Upload a list and get a spreadsheet of results back.
- **When there's no record, ask the source.** Requests go to the issuing institution, where someone owns each one and the history can't be quietly rewritten.

## The vision

We want checking a document to be as simple as checking a website address: instant, free for the person asking, and not dependent on knowing anyone.

Public verification is the front door. Behind it, Legitfy becomes a trusted way for institutions to exchange documents safely, starting with universities, colleges and professional bodies in Tanzania and growing across borders. A graduate's record should mean the same thing wherever they take it.

## The chains

**[BOT Chain](https://botchain.ai)** is Legitfy's main network. It holds the public record, which you can inspect on [BOTScan](https://scan.botchain.ai).

| Network | Chain ID | Use |
|---|---|---|
| BOT Chain | 677 | Main network |
| BOT Chain Testnet | 968 | Testing |

Public checks can search more than one network, so a document issued on another supported chain can still be found.

**What goes on chain:** document fingerprints, issue and revocation dates, institution names, and a daily fingerprint of our activity log.

**What never goes on chain:** documents, names of certificate holders, or any other personal data. A blockchain can't be erased, so private details stay off it.

## Learn more

To run or deploy Legitfy, see [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

## License

See `LICENSE`.
