#pragma once

#include "CoreMinimal.h"
#include "GameFramework/GameModeBase.h"
#include "VantageGameMode.generated.h"

class APlayerStart;

/**
 * Owns the demo's objective state and assembles the level.
 *
 * The level has to exist before the player pawn spawns, or the player is
 * dropped into an empty world with no floor. Rather than trust a single hook to
 * fire early enough, EnsureLevelBuilt() is idempotent and called from three
 * places, in increasing order of desperation:
 *
 *   1. InitGame                - normal path, runs while the map is still empty
 *   2. ChoosePlayerStart       - guaranteed to run before the pawn is spawned
 *   3. StartPlay               - last resort, if both of the above were skipped
 *
 * Only the first one that runs does any work.
 */
UCLASS()
class VANTAGE_API AVantageGameMode : public AGameModeBase
{
	GENERATED_BODY()

public:
	AVantageGameMode();

	virtual void InitGame(const FString& MapName, const FString& Options, FString& ErrorMessage) override;
	virtual AActor* ChoosePlayerStart_Implementation(AController* Player) override;
	virtual void StartPlay() override;

	int32 GetShardsCollected() const { return ShardsCollected; }
	int32 GetShardsRequired() const { return ShardsRequired; }
	bool IsVaultOpen() const { return bVaultOpen; }
	bool IsComplete() const { return bComplete; }

	/** Where the player entered. Used to recover anyone who falls out of the map. */
	FVector GetSpawnLocation() const { return SpawnLocation; }

	/** Called by AShardPickup when the player takes one. */
	void CollectShard();

	/** Called by ASlidingDoor once it has finished opening. */
	void NotifyVaultOpened() { bVaultOpen = true; }

	/** Called by AVaultTerminal. Ends the demo. */
	void CompleteDemo();

	/** The single line of objective text the HUD shows. */
	FText GetObjectiveText() const;

	/** Seconds since the demo was completed, or 0 while still playing. */
	float GetTimeSinceCompletion() const;

private:
	/** Builds the level exactly once, whichever hook gets here first. */
	void EnsureLevelBuilt();

	UPROPERTY(EditDefaultsOnly, Category = "Vantage")
	int32 ShardsRequired = 3;

	UPROPERTY(Transient)
	TObjectPtr<APlayerStart> SpawnPoint;

	FVector SpawnLocation = FVector(-480.f, 0.f, 110.f);

	bool bLevelBuilt = false;
	int32 ShardsCollected = 0;
	bool bVaultOpen = false;
	bool bComplete = false;
	float CompletionTime = 0.f;
};
