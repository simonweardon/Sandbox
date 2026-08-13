#pragma once

#include "CoreMinimal.h"
#include "GameFramework/GameModeBase.h"
#include "VantageGameMode.generated.h"

/**
 * Owns the demo's objective state and assembles the level.
 *
 * The level is built from InitGame rather than BeginPlay on purpose: the engine
 * spawns the player pawn between InitGame and the world's BeginPlay, so this is
 * the last hook that still runs while the map is empty. Building any later
 * means dropping the player into a world with no floor under them.
 */
UCLASS()
class VANTAGE_API AVantageGameMode : public AGameModeBase
{
	GENERATED_BODY()

public:
	AVantageGameMode();

	virtual void InitGame(const FString& MapName, const FString& Options, FString& ErrorMessage) override;

	int32 GetShardsCollected() const { return ShardsCollected; }
	int32 GetShardsRequired() const { return ShardsRequired; }
	bool IsVaultOpen() const { return bVaultOpen; }
	bool IsComplete() const { return bComplete; }

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
	void BuildLevel();

	UPROPERTY(EditDefaultsOnly, Category = "Vantage")
	int32 ShardsRequired = 3;

	int32 ShardsCollected = 0;
	bool bVaultOpen = false;
	bool bComplete = false;
	float CompletionTime = 0.f;
};
