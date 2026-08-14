#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Character.h"
#include "ZombieCharacter.generated.h"

class UStaticMeshComponent;

/**
 * A shambler. Walks straight at the player and swings when it gets there.
 *
 * Steering is deliberately direct rather than navmesh driven: generating
 * navigation at runtime needs a bounds volume placed in the map, and this
 * project has no map to place one in. On open sand, walking at the player and
 * letting the capsule slide along obstacles is both simpler and good enough.
 */
UCLASS()
class VANTAGE_API AZombieCharacter : public ACharacter
{
	GENERATED_BODY()

public:
	AZombieCharacter();

	virtual void BeginPlay() override;
	virtual void Tick(float DeltaSeconds) override;

	/** Applies a hit. Returns true if this hit killed it. */
	bool ApplyHit(float Damage, bool bHeadshot);

	bool IsDead() const { return bDead; }

	/** Varies build, tint and speed so a wave is not a row of clones. */
	void Randomise(int32 Seed);

	/** Named so the shot trace can tell a head hit from a body hit. */
	static const FName HeadTag;

	UPROPERTY(EditDefaultsOnly, Category = "Zombie") float MaxHealth = 100.f;
	UPROPERTY(EditDefaultsOnly, Category = "Zombie") float TouchDamage = 11.f;
	UPROPERTY(EditDefaultsOnly, Category = "Zombie") float AttackRange = 135.f;
	UPROPERTY(EditDefaultsOnly, Category = "Zombie") float AttackInterval = 1.15f;

private:
	void Shamble(float DeltaSeconds);
	void ChasePlayer(float DeltaSeconds);
	void Collapse(float DeltaSeconds);
	void Die();

	UStaticMeshComponent* AddPart(const TCHAR* Name, const FVector& Location, const FVector& HalfExtent, const FRotator& Rotation, bool bIsHead = false);

	/** Everything visible hangs off this, so death can topple it in one go. */
	UPROPERTY(VisibleAnywhere, Category = "Zombie") TObjectPtr<USceneComponent> BodyRoot;
	UPROPERTY(VisibleAnywhere, Category = "Zombie") TObjectPtr<UStaticMeshComponent> Torso;
	UPROPERTY(VisibleAnywhere, Category = "Zombie") TObjectPtr<UStaticMeshComponent> Head;
	UPROPERTY(VisibleAnywhere, Category = "Zombie") TObjectPtr<UStaticMeshComponent> LeftArm;
	UPROPERTY(VisibleAnywhere, Category = "Zombie") TObjectPtr<UStaticMeshComponent> RightArm;
	UPROPERTY(VisibleAnywhere, Category = "Zombie") TObjectPtr<UStaticMeshComponent> LeftLeg;
	UPROPERTY(VisibleAnywhere, Category = "Zombie") TObjectPtr<UStaticMeshComponent> RightLeg;

	float Health = 100.f;
	float Phase = 0.f;
	float AttackCooldown = 0.f;

	/** 1 right after a swing, decaying to 0. Drives the lunge forward. */
	float AttackLunge = 0.f;
	float DeadFor = 0.f;
	bool bDead = false;

	/** Per-zombie gait variation, set by Randomise. */
	float SwayAmount = 6.f;
	float GaitRate = 4.4f;

	FLinearColor SkinColour = FLinearColor(0.30f, 0.34f, 0.24f);
	FLinearColor ClothColour = FLinearColor(0.14f, 0.13f, 0.16f);
};
